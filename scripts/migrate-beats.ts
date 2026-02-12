import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as dotenv from "dotenv";
import { saveToLocalStorage } from "../src/services/storage";

// Load environment variables
dotenv.config();

// Initialize Firebase (copied from src/services/firebase.ts logic or import it if possible)
// Better to initialize separately for script to avoid side effects of server start
if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
    } else {
        console.error("Missing Firebase credentials");
        process.exit(1);
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function migrateBeats() {
    console.log("Starting migration...");

    try {
        const snapshot = await db.collection("beats").get();
        const beats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log(`Found ${beats.length} beats to check.`);

        let migrated = 0;
        let errors = 0;
        let skipped = 0;

        for (const beat of beats) {
            const b = beat as any;
            if (!b.audioUrl) {
                skipped++;
                continue;
            }

            if (b.audioUrl.includes("firebasestorage.googleapis.com")) {
                console.log(`Migrating beat ${b.id}: ${b.title}`);

                try {
                    // 1. Download to temp file
                    const tempPath = path.join(process.cwd(), "temp_migration_" + b.id + ".mp3");
                    await downloadFile(b.audioUrl, tempPath);

                    // 2. Save to local storage
                    // Use existing ID as filename if possible, or new one
                    const { url: localUrl } = await saveToLocalStorage(tempPath, `${b.id}.mp3`);

                    // 3. Construct full URL
                    const baseUrl = process.env.VPS_URL || "https://searchmybeats.com";
                    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
                    const fullAudioUrl = `${cleanBaseUrl}${localUrl}`;

                    // 4. Update Firestore
                    await db.collection("beats").doc(b.id).update({
                        audioUrl: fullAudioUrl,
                        _migratedFromFirebase: true,
                        _migrationDate: new Date()
                    });

                    // 5. Delete temp file
                    fs.unlinkSync(tempPath);

                    // 6. Delete from Firebase Storage
                    // Extract path from URL is hard, better to construct path if we know pattern
                    // Pattern: beats/{userId}/{beatId}/audio.mp3 generally
                    // But we can try to use deleteObject via URL? No, admin SDK uses bucket file object.

                    // Let's assume standard path: beats/{userId}/{beatId}/audio.mp3
                    // If the user uploaded multiple files (cover art etc), we might miss them.
                    // But for now focus on audio.
                    if (b.userId && b.id) {
                        const filePath = `beats/${b.userId}/${b.id}/audio.mp3`;
                        try {
                            await bucket.file(filePath).delete();
                            console.log(`Deleted Firebase file: ${filePath}`);
                        } catch (e) {
                            // Ignore if not found, possibly already deleted or different path
                            console.warn(`Could not delete from Firebase (might be different path): ${filePath}`);
                        }
                    }

                    console.log(`Migrated ${b.id} -> ${fullAudioUrl}`);
                    migrated++;
                } catch (err) {
                    console.error(`Failed to migrate beat ${b.id}:`, err);
                    errors++;
                }
            } else {
                skipped++;
            }
        }

        console.log(`Migration complete.`);
        console.log(`Migrated: ${migrated}`);
        console.log(`Skipped: ${skipped}`);
        console.log(`Errors: ${errors}`);

    } catch (error) {
        console.error("Migration fatal error:", error);
    }
}

migrateBeats();
