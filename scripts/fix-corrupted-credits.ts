import { db } from "./src/lib/firebase"; // Assuming this exists or using admin SDK
// Actually, since this runs on VPS/Local with Admin SDK usually:

import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert } from "firebase-admin/app";
import * as fs from "fs";
import * as path from "path";

// Path to your service account key
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "../service-account.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("Service account file not found at:", SERVICE_ACCOUNT_PATH);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function fixCorruptedCredits() {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    console.log(`Scanning ${snapshot.size} users...`);

    let fixedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const credits = data.credits;

        if (credits && typeof credits.available === "object" && credits.available !== null) {
            console.log(`Found corrupted credits for user: ${data.email || doc.id}`);

            // Extract the number from the object { available: X }
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
}

fixCorruptedCredits().catch(console.error);
