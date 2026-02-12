import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
        }),
    });
}

const db = admin.firestore();
const VPS_URL = process.env.VPS_URL || "https://searchmybeats.com";
const CLEAN_VPS_URL = VPS_URL.replace(/\/$/, "");

async function fixLocalhostUrls() {
    console.log("Checking for 'localhost' URLs in Firestore...");
    try {
        const snapshot = await db.collection("beats").get();
        let updated = 0;

        for (const doc of snapshot.docs) {
            const beat = doc.data();
            if (beat.audioUrl && (beat.audioUrl.includes("localhost") || beat.audioUrl.includes("127.0.0.1"))) {
                // Extract filename part: /api/uploads/xyz.mp3
                const parts = beat.audioUrl.split("/api/uploads/");
                if (parts.length > 1) {
                    const filename = parts[1];
                    const newUrl = `${CLEAN_VPS_URL}/api/uploads/${filename}`;

                    await db.collection("beats").doc(doc.id).update({
                        audioUrl: newUrl
                    });

                    console.log(`Fixed ${doc.id}: ${beat.audioUrl} -> ${newUrl}`);
                    updated++;
                } else {
                    console.warn(`Could not parse localhost URL for ${doc.id}: ${beat.audioUrl}`);
                }
            }
        }
        console.log(`Fix complete. Updated ${updated} beats.`);
    } catch (e) {
        console.error("Error fixing URLs:", e);
    }
}

fixLocalhostUrls();
