import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { importRouter } from "./routes/import";
import { uploadRouter } from "./routes/upload";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Parse allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "https://searchmybeats.com",
  "http://localhost:3000",
];

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  })
);
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "smb-processor",
    timestamp: new Date().toISOString(),
  });
});

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url} (Original: ${req.originalUrl})`);
  next();
});

// API routes
app.use("/api", importRouter);
app.use("/api/upload", uploadRouter);
app.use("/upload", uploadRouter); // Fallback for Nginx stripping

// Serve uploads statically
import fs from "fs";
import path from "path";
const uploadDir = path.join(process.cwd(), "storage/uploads");
console.log("[DEBUG] Serving static files from:", uploadDir);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Mount at both locations to handle Nginx variants
app.use("/api/uploads", express.static(uploadDir));
app.use("/uploads", express.static(uploadDir));

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`
========================================
  SMB Processor Service
  Running on port ${PORT}
  Environment: ${process.env.NODE_ENV || "development"}
========================================
  `);
});
