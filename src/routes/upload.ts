import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { updateBeat, verifyIdToken } from "../services/firebase";

export const uploadRouter = Router();

// Configure multer for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "storage/uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("audio/")) {
            cb(null, true);
        } else {
            cb(new Error("Only audio files are allowed"));
        }
    },
});

/**
 * POST /api/upload
 * Handle file upload from frontend
 */
uploadRouter.post(
    "/",
    upload.single("file"),
    async (req: Request, res: Response) => {
        const apiKey = req.headers["x-api-key"] as string;
        const authHeader = req.headers["authorization"];
        let userId: string | null = null;

        // Check API Key first (Server-to-Server)
        if (process.env.API_SECRET_KEY && apiKey === process.env.API_SECRET_KEY) {
            // Allowed system access
        }
        // Check Firebase Token (Client-to-Server)
        else if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split("Bearer ")[1];
            try {
                const decodedToken = await verifyIdToken(token);
                userId = decodedToken.uid;
            } catch (e) {
                return res.status(401).json({ error: "Invalid authentication token" });
            }
        } else {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        try {
            // Construct public URL
            // Prefer VPS_URL from env, otherwise fallback to request headers
            let baseUrl = "";
            if (process.env.VPS_URL) {
                baseUrl = process.env.VPS_URL.replace(/\/$/, "");
            } else {
                const protocol = req.headers["x-forwarded-proto"] || req.protocol;
                const host = req.headers["host"];
                baseUrl = `${protocol}://${host}`;
            }

            const fileUrl = `${baseUrl}/api/uploads/${req.file.filename}`;

            res.json({
                url: fileUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
            });
        } catch (error) {
            console.error("Upload error:", error);
            // Clean up file if error
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({ error: "Failed to process upload" });
        }
    }
);

/**
 * DELETE /api/upload
 * Delete file from local storage
 */
uploadRouter.delete("/", async (req: Request, res: Response) => {
    const apiKey = req.headers["x-api-key"] as string;
    const authHeader = req.headers["authorization"];
    const { filename } = req.body;

    // Verify Auth (API Key or Token)
    let authorized = false;
    if (process.env.API_SECRET_KEY && apiKey === process.env.API_SECRET_KEY) {
        authorized = true;
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            await verifyIdToken(authHeader.split("Bearer ")[1]);
            authorized = true;
        } catch {
            authorized = false;
        }
    }

    if (!authorized) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!filename) {
        return res.status(400).json({ error: "Filename required" });
    }

    try {
        const filePath = path.join(process.cwd(), "storage/uploads", filename);
        console.log(`[DEBUG] Attempting to delete: ${filename} at ${filePath}`);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[DEBUG] Deleted file successfully: ${filename}`);
            res.json({ message: "File deleted successfully" });
        } else {
            console.warn(`[DEBUG] File not found for deletion: ${filePath}`);
            res.status(404).json({ error: "File not found" });
        }
    } catch (error) {
        console.error("[DEBUG] Delete error:", error);
        res.status(500).json({ error: "Failed to delete file" });
    }
});

/**
 * GET /api/upload/ping
 * Test connectivity to this router
 */
uploadRouter.get("/ping", (req: Request, res: Response) => {
    res.json({ message: "Upload router is reachable", timestamp: new Date() });
});
