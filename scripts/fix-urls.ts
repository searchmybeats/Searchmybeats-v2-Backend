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

async function fixUrls() {
    console.log("Checking for incorrect VPS URLs...");
    try {
        const snapshot = await db.collection("beats").get();
        let updated = 0;

        for (const doc of snapshot.docs) {
            const beat = doc.data();
            if (beat.audioUrl && beat.audioUrl.includes(".com/uploads/")) {
                const newUrl = beat.audioUrl.replace(".com/uploads/", ".com/api/uploads/");

                await db.collection("beats").doc(doc.id).update({
                    audioUrl: newUrl
                });

                console.log(`Fixed ${doc.id}: ${newUrl}`);
                updated++;
            }
        }
        console.log(`Fix complete. Updated ${updated} beats.`);
    } catch (e) {
        console.error("Error fixing URLs:", e);
    }
}

fixUrls();
