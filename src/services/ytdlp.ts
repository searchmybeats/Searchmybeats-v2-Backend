import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { v4 as uuid } from "uuid";
import { scrapeChannelSocials } from "./scraper";

const execAsync = promisify(exec);

export interface DownloadResult {
  filePath: string;
  duration: number;
  title: string;
  fileSize: number;
  artist?: string;
}

const MAX_FILE_SIZE_MB = 50;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Download audio from YouTube using yt-dlp
 */
export async function downloadWithYtdlp(url: string): Promise<DownloadResult> {
  const tempDir = os.tmpdir();
  const outputId = uuid();
  const outputTemplate = path.join(tempDir, `smb_${outputId}`);

  // Build yt-dlp command
  const command = buildYtdlpCommand(url, outputTemplate);
  const maskedCommand = command.replace(/--cookies ".*?"/, '--cookies "****"');
  console.log(`Executing: ${maskedCommand}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: DOWNLOAD_TIMEOUT_MS,
    });

    if (stderr) {
      // Filter out warnings, only log actual errors
      const errors = stderr
        .split("\n")
        .filter((line) => !line.includes("WARNING"));
      if (errors.length > 0) {
        console.warn(`[yt-dlp stderr] for ${url}:`, errors.join("\n"));
      }
    }

    // Parse metadata from JSON output
    const metadata = parseYtdlpOutput(stdout);

    // Find the downloaded MP3 file
    const mp3Files = fs.readdirSync(tempDir).filter(
      (f) => f.startsWith(`smb_${outputId}`) && f.endsWith(".mp3")
    );

    if (mp3Files.length === 0) {
      throw new Error("Failed to download audio - no MP3 file found");
    }

    const filePath = path.join(tempDir, mp3Files[0]);
    const stats = fs.statSync(filePath);

    console.log(`Download complete: ${filePath} (${stats.size} bytes)`);

    return {
      filePath,
      duration: metadata.duration || 0,
      title: metadata.title || "Unknown",
      fileSize: stats.size,
    };
  } catch (error: unknown) {
    // Handle specific yt-dlp errors
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("Sign in to confirm")) {
      throw new Error(
        "YouTube requires authentication. Please try a different video or update cookies."
      );
    }

    if (errorMessage.includes("Video unavailable")) {
      throw new Error("Video is unavailable or has been removed.");
    }

    if (errorMessage.includes("Private video")) {
      throw new Error("Cannot download private videos.");
    }

    if (errorMessage.includes("age-restricted")) {
      throw new Error("Cannot download age-restricted videos without authentication.");
    }

    throw error;
  }
}

/**
 * Build the yt-dlp command with optimized flags
 */
function buildYtdlpCommand(url: string, outputTemplate: string): string {
  const flags = [
    // Format selection - best audio
    '-f "bestaudio/best"',
    // Extract audio and convert to MP3
    "-x",
    "--audio-format mp3",
    "--audio-quality 0", // Best quality
    // Output template
    `-o "${outputTemplate}.%(ext)s"`,
    // Performance and reliability
    "--no-check-certificates",
    "--no-warnings",
    "--geo-bypass",
    "--socket-timeout 30",
    "--retries 3",
    // Size limit
    `--max-filesize ${MAX_FILE_SIZE_MB}M`,
    // Output metadata as JSON (last line of stdout)
    "--print-json",
    // Avoid interactive prompts
    "--no-playlist",
    "--no-part",
  ];

  // Escape the URL
  const escapedUrl = url.replace(/"/g, '\\"');

  // Check for cookies.txt
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cookiesPath)) {
    console.log("Using cookies from cookies.txt");
    flags.push(`--cookies "${cookiesPath}"`);
  }

  // Force Deno runtime if available (fixes "JS runtimes: none" error)
  if (fs.existsSync("/usr/local/bin/deno")) {
    flags.push('--js-runtimes "deno:/usr/local/bin/deno"');
  }

  return `yt-dlp ${flags.join(" ")} "${escapedUrl}"`;
}

/**
 * Parse yt-dlp JSON output to extract metadata
 */
function parseYtdlpOutput(stdout: string): {
  duration: number;
  title: string;
} {
  try {
    // JSON output is typically the last non-empty line
    const lines = stdout.split("\n").filter(Boolean);
    const jsonLine = lines[lines.length - 1];

    if (jsonLine && jsonLine.startsWith("{")) {
      const metadata = JSON.parse(jsonLine);
      return {
        duration: metadata.duration || 0,
        title: metadata.title || metadata.fulltitle || "Unknown",
      };
    }
  } catch (e) {
    console.warn("Failed to parse yt-dlp JSON output:", e);
  }

  return { duration: 0, title: "Unknown" };
}

/**
 * Get only metadata for a URL without downloading audio
 */
export async function getMetadataOnly(url: string): Promise<any> {
  const flags = [
    "--skip-download",
    "--print-json",
    "--no-check-certificates",
    "--no-warnings",
    "--geo-bypass",
  ];

  // Escape the URL
  const escapedUrl = url.replace(/"/g, '\\"');
  // Check for cookies.txt
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cookiesPath)) {
    flags.push(`--cookies "${cookiesPath}"`);
  }

  // Force Deno runtime
  if (fs.existsSync("/usr/local/bin/deno")) {
    flags.push('--js-runtimes "deno:/usr/local/bin/deno"');
  }

  const command = `yt-dlp ${flags.join(" ")} "${escapedUrl}"`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000, // 30s timeout for metadata
    });

    const lines = stdout.split("\n").filter(Boolean);
    const jsonLine = lines[lines.length - 1];

    if (jsonLine && jsonLine.startsWith("{")) {
      const metadata = JSON.parse(jsonLine);

      // Fallback: If description or links are missing, try scraping the channel
      if ((!metadata.description || !metadata.links) && (metadata.channel_id || metadata.uploader_id)) {
        const channelId = metadata.channel_id || metadata.uploader_id;
        console.log(`[Metadata] Missing details, attempting fallback scrape for channel: ${channelId}`);
        try {
          const scraped = await scrapeChannelSocials(channelId);
          if (scraped.description && !metadata.description) {
            metadata.description = scraped.description;
          }
          if (scraped.links && scraped.links.length > 0) {
            // Merge links, prioritizing official metadata if it existed (though here it's likely empty)
            metadata.links = [...(metadata.links || []), ...scraped.links];
          }
        } catch (scrapeErr) {
          console.warn(`[Metadata] Fallback scrape failed: ${scrapeErr}`);
        }
      }

      return metadata;
    }
  } catch (error) {
    console.error("Failed to get YouTube metadata:", error);
  }
  return null;
}

/**
 * Search YouTube and return metadata for the first result
 */
export async function searchYouTubeMetadata(query: string): Promise<any> {
  const flags = [
    "--skip-download",
    "--print-json",
    "--no-check-certificates",
    "--no-warnings",
    "--geo-bypass",
    "--no-playlist",
  ];

  // ytsearch1:query
  const escapedQuery = query.replace(/"/g, '\\"');
  // Check for cookies.txt
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cookiesPath)) {
    flags.push(`--cookies "${cookiesPath}"`);
  }

  // Force Deno runtime
  if (fs.existsSync("/usr/local/bin/deno")) {
    flags.push('--js-runtimes "deno:/usr/local/bin/deno"');
  }

  const command = `yt-dlp ${flags.join(" ")} "ytsearch1:${escapedQuery}"`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    const lines = stdout.split("\n").filter(Boolean);
    const jsonLine = lines[lines.length - 1];

    if (jsonLine && jsonLine.startsWith("{")) {
      const metadata = JSON.parse(jsonLine);

      // Fallback: If description is short/empty or links are missing, try scraping
      if ((!metadata.description || metadata.description.length < 50 || !metadata.links) && (metadata.channel_id || metadata.uploader_id)) {
        const channelId = metadata.channel_id || metadata.uploader_id;
        console.log(`[Search] Potential missing metadata, attempting fallback scrape for channel: ${channelId}`);
        try {
          const scraped = await scrapeChannelSocials(channelId);
          // Append scraped description if original is lacking
          if (scraped.description) {
            if (!metadata.description) {
              metadata.description = scraped.description;
            } else {
              metadata.description += `\n\n[Channel Description]\n${scraped.description}`;
            }
          }
          if (scraped.links && scraped.links.length > 0) {
            metadata.links = [...(metadata.links || []), ...scraped.links];
          }
        } catch (scrapeErr) {
          console.warn(`[Search] Fallback scrape failed: ${scrapeErr}`);
        }
      }

      return metadata;
    }
  } catch (error) {
    console.error("Failed to search YouTube metadata:", error);
  }
  return null;
}

/**
 * Clean up temporary file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up temp file: ${filePath}`);
    }
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error);
  }
}

/**
 * Check if yt-dlp is installed and accessible
 */
export async function checkYtdlpInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("yt-dlp --version");
    console.log(`yt-dlp version: ${stdout.trim()}`);
    return true;
  } catch {
    console.error("yt-dlp is not installed or not in PATH");
    return false;
  }
}

