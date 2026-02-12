import * as fs from "fs";
import * as path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "storage/uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface StorageResult {
    url: string;
    filename: string;
    size: number;
}

/**
 * Save a file from a temporary path to the persistent local storage
 */
export async function saveToLocalStorage(
    tempPath: string,
    originalFilename?: string
): Promise<StorageResult> {
    const stats = fs.statSync(tempPath);

    // Generate unique filename
    const ext = originalFilename ? path.extname(originalFilename) : ".mp3";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const paramName = originalFilename ? path.basename(originalFilename, ext) : "audio";
    // Sanitize filename
    const safeName = paramName.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const filename = `${safeName}-${uniqueSuffix}${ext}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    // Move file
    fs.copyFileSync(tempPath, destPath);
    // We don't delete the temp path here, let the caller handle markup/cleanup of temp files
    // actually fs.renameSync is better if on same volume, but copy is safer across partitions
    // The caller (ytdlp logic) cleans up temp files in 'finally' block, so copy is correct.

    // Construct URL (This assumes standard setup, might need config for domain)
    // For now we return a relative path or absolute path that the frontend can construct?
    // No, backend should return full URL if possible, or at least the path component.
    // We'll return the relative path from domain root: /uploads/filename

    // Actually, let's try to return a full URL if we can get the host, but here we are in a service.
    // Let's return the relative URL and let the controller prepend host if needed, 
    // OR just return /uploads/filename which is Root-Relative and works fine in browsers.

    const url = `/uploads/${filename}`;

    return {
        url,
        filename,
        size: stats.size
    };
}

/**
 * Delete a file from local storage
 */
export async function deleteFromLocalStorage(filename: string): Promise<void> {
    // Security check: prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted local file: ${safeFilename}`);
    } else {
        console.warn(`File not found for deletion: ${safeFilename}`);
    }
}
