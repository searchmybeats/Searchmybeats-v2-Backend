import { checkYtdlpInstalled, getMetadataOnly } from "../src/services/ytdlp";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

async function runDiagnostics() {
    console.log("=== SMB Processor Diagnostics ===\n");

    // 1. Check yt-dlp
    console.log("1. Checking yt-dlp...");
    const ytdlpOk = await checkYtdlpInstalled();
    if (ytdlpOk) {
        try {
            const { stdout } = await execAsync("yt-dlp --version");
            console.log(`   [OK] yt-dlp version: ${stdout.trim()}`);
        } catch (e) {
            console.log("   [ERROR] Failed to get yt-dlp version");
        }
    } else {
        console.log("   [ERROR] yt-dlp is NOT installed or NOT in PATH");
    }

    // 2. Check FFmpeg
    console.log("\n2. Checking FFmpeg...");
    try {
        const { stdout } = await execAsync("ffmpeg -version");
        console.log(`   [OK] FFmpeg found: ${stdout.split("\n")[0]}`);
    } catch (e) {
        console.log("   [ERROR] FFmpeg is NOT installed or NOT in PATH (Required for MP3 conversion)");
    }

    // 3. Check Cookies
    console.log("\n3. Checking cookies.txt...");
    const cookiesPath = path.join(process.cwd(), "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
        const stats = fs.statSync(cookiesPath);
        console.log(`   [OK] cookies.txt found (${stats.size} bytes)`);
        const content = fs.readFileSync(cookiesPath, "utf8");
        if (content.includes("youtube.com") || content.includes(".google.com")) {
            console.log("   [OK] cookies.txt seems to contain YouTube/Google cookies");
        } else {
            console.log("   [WARNING] cookies.txt found but doesn't seem to contain YouTube domains");
        }
    } else {
        console.log("   [WARNING] cookies.txt NOT found. YouTube may block downloads.");
    }

    // 4. Check Deno (for signature JS)
    console.log("\n4. Checking Deno...");
    if (fs.existsSync("/usr/local/bin/deno")) {
        console.log("   [OK] Deno found at /usr/local/bin/deno (Used for YouTube JS decryption)");
    } else {
        console.log("   [WARNING] Deno NOT found at /usr/local/bin/deno. Signature decryption might fail.");
    }

    // 5. Test Metadata Fetch
    console.log("\n5. Testing Metadata Fetch (YouTube)...");
    const testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"; // Never Gonna Give You Up (safe test)
    console.log(`   Fetching ${testUrl}...`);
    try {
        const metadata = await getMetadataOnly(testUrl);
        if (metadata) {
            console.log(`   [OK] Successfully fetched metadata: "${metadata.title}"`);
        } else {
            console.log("   [ERROR] Metadata fetch returned null");
        }
    } catch (e) {
        console.log(`   [ERROR] Metadata fetch failed: ${e instanceof Error ? e.message : e}`);
    }

    console.log("\n=== Diagnostics Finished ===");
}

runDiagnostics().catch(err => {
    console.error("Diagnostic script failed:", err);
});
