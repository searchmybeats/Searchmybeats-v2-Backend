import { downloadWithYtdlp } from "../src/services/ytdlp";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

/**
 * Diagnostic script to test yt-dlp connectivity and cookies on VPS
 * 
 * Usage: npx ts-node scripts/test-ytdlp.ts [youtube-url]
 */
async function main() {
    const url = process.argv[2] || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    console.log("==========================================");
    console.log("   yt-dlp Diagnostic Tool for SearchMyBeats");
    console.log("==========================================");
    console.log(`Testing URL: ${url}`);
    console.log(`Current working directory: ${process.cwd()}`);

    // Check for cookies.txt
    const cookiesPath = path.join(process.cwd(), "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
        console.log(`[OK] cookies.txt found at ${cookiesPath}`);
        const content = fs.readFileSync(cookiesPath, "utf8");
        console.log(`[INFO] cookies.txt size: ${content.length} bytes`);
        if (!content.includes("\t")) {
            console.warn("[WARNING] cookies.txt doesn't look like a Netscape format file (tabs missing).");
        }
    } else {
        console.warn("[ERROR] cookies.txt NOT found in current directory!");
    }

    // Check for Deno
    const denoPaths = ["/usr/local/bin/deno", "/usr/bin/deno"];
    const foundDeno = denoPaths.find(p => fs.existsSync(p));
    if (foundDeno) {
        console.log(`[OK] Deno found at ${foundDeno}`);
    } else {
        console.warn("[INFO] Deno not found. Some YouTube features might require it.");
    }

    try {
        console.log("\nStarting test download (metadata and audio extract)...");
        const result = await downloadWithYtdlp(url);

        console.log("\n[SUCCESS] yt-dlp worked correctly!");
        console.log(`Title: ${result.title}`);
        console.log(`Duration: ${result.duration}s`);
        console.log(`File Size: ${result.fileSize} bytes`);
        console.log(`Temp File: ${result.filePath}`);

        // Cleanup
        if (fs.existsSync(result.filePath)) {
            fs.unlinkSync(result.filePath);
            console.log("Cleaned up test file.");
        }
    } catch (error) {
        console.error("\n[FAILED] yt-dlp test failed!");
        console.error("Error Message:", error instanceof Error ? error.message : error);

        if (String(error).includes("Sign in to confirm")) {
            console.log("\n[DIAGNOSIS] This is an AUTHENTICATION issue. Your cookies.txt is either invalid, expired, or not being picked up.");
        } else if (String(error).includes("JS runtimes: none")) {
            console.log("\n[DIAGNOSIS] Missing JS runtime. Install Deno on your VPS: curl -fsSL https://deno.land/install.sh | sh");
        }
    }
}

main().catch(console.error);
