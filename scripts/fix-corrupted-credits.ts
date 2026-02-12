import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from the parent directory's .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

/**
 * standalone script to fix corrupted credits.available in Firestore.
 */
async function fixCorruptedCredits() {
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
            });
            console.log("Firebase Admin initialized with service account.");
        } else {
            console.error("Missing Firebase credentials in .env file.");
            process.exit(1);
        }
    }

    const db = admin.firestore();
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    console.log(`Scanning ${snapshot.size} users for corrupted data...`);

    let fixedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const credits = data.credits;

        // Check if available is an object instead of a number
        if (credits && typeof credits.available === "object" && credits.available !== null) {
            console.log(`Found corrupted credits for user: ${data.email || doc.id}`);

            // Extract the numeric value from the corrupted object { available: X }
            const actualAvailable = (credits.available as any).available;

            if (typeof actualAvailable === "number") {
                await doc.ref.update({
                    "credits.available": actualAvailable
                });
                console.log(`Successfully fixed credits for ${data.email || doc.id} to ${actualAvailable}`);
                fixedCount++;
            } else {
                console.warn(`Could not find valid number in object for ${data.email || doc.id}:`, credits.available);
            }
        }
    }

    console.log(`Done. Fixed ${fixedCount} users.`);
    process.exit(0);
}

fixCorruptedCredits().catch(err => {
    console.error("Repair failed:", err);
    process.exit(1);
});
