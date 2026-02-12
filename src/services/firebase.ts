import * as admin from "firebase-admin";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin SDK
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
    console.log("Firebase Admin initialized with service account.");
  } else {
    // Fallback to Application Default Credentials
    admin.initializeApp({
      projectId: projectId || undefined,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log("Firebase Admin initialized with Application Default Credentials.");
  }
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();

export interface UploadResult {
  audioUrl: string;
  fileSize: number;
}

/**
 * Upload audio file to Firebase Storage
 */
export async function uploadToStorage(
  localPath: string,
  userId: string,
  beatId: string
): Promise<UploadResult> {
  const storagePath = `beats/${userId}/${beatId}/audio.mp3`;

  // Read file
  const fileBuffer = fs.readFileSync(localPath);
  const fileSize = fileBuffer.length;

  console.log(`Uploading ${fileSize} bytes to ${storagePath}`);

  // Upload to Storage
  const file = bucket.file(storagePath);
  await file.save(fileBuffer, {
    metadata: {
      contentType: "audio/mpeg",
    },
  });

  // Make public
  await file.makePublic();

  const audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  console.log(`Upload complete: ${audioUrl}`);

  return { audioUrl, fileSize };
}

/**
 * Update beat document in Firestore
 */
export async function updateBeat(
  beatId: string,
  data: Record<string, unknown>
): Promise<void> {
  const beatRef = db.collection("beats").doc(beatId);

  await beatRef.update({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Beat ${beatId} updated:`, Object.keys(data).join(", "));
}

/**
 * Get beat document from Firestore
 */
export async function getBeat(
  beatId: string
): Promise<admin.firestore.DocumentData | null> {
  const beatRef = db.collection("beats").doc(beatId);
  const doc = await beatRef.get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
}

/**
 * Verify Firebase ID Token
 */
export async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
  return admin.auth().verifyIdToken(token);
}

/**
 * Get all pending import beats (for polling fallback)
 */
export async function getPendingImports(): Promise<
  admin.firestore.DocumentData[]
> {
  const snapshot = await db
    .collection("beats")
    .where("_importPending", "==", true)
    .where("status", "==", "processing")
    .limit(10)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
