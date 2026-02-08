import { Router, Request, Response } from "express";
import {
  downloadWithYtdlp,
  cleanupTempFile,
  checkYtdlpInstalled,
  getMetadataOnly,
  searchYouTubeMetadata,
} from "../services/ytdlp";
import { uploadToStorage, updateBeat, getBeat } from "../services/firebase";
import {
  validateYouTubeUrl,
  validateBeatStarsUrl,
  extractBeatStarsTrackId
} from "../utils/validation";
import { downloadBeatStarsAudio, resolveBeatStarsUrl } from "../services/beatstars";
import { scrapeBeatStarsMetadata } from "../services/scraper";

export const importRouter = Router();

interface ImportRequest {
  beatId: string;
  url: string;
  userId: string;
  apiKey: string;
}

/**
 * POST /api/process-import
 *
 * Process audio import from YouTube/BeatStars
 * Downloads audio, uploads to Firebase Storage, updates Firestore
 */
importRouter.post("/process-import", async (req: Request, res: Response) => {
  const { beatId, url, userId } = req.body as ImportRequest;
  const apiKey = req.headers["x-api-key"] as string;

  // Validate API key
  if (!process.env.API_SECRET_KEY || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate required fields
  if (!beatId || !url || !userId) {
    return res.status(400).json({
      error: "Missing required fields: beatId, url, userId",
    });
  }

  // Validate URL format
  const isYouTube = validateYouTubeUrl(url);
  const isBeatStars = validateBeatStarsUrl(url);

  if (!isYouTube && !isBeatStars) {
    await updateBeat(beatId, {
      status: "failed",
      _importPending: false,
      _processingError: "Invalid URL format. Only YouTube and BeatStars URLs are supported.",
    });
    return res.status(400).json({ error: "Invalid URL format" });
  }

  // BeatStars handling (will be processed in background)
  if (isBeatStars) {
    console.log(`Received BeatStars import request: ${url}`);
  }

  // Respond immediately, process in background
  res.status(202).json({
    message: "Processing started",
    beatId,
  });

  // Process import asynchronously
  processImport(beatId, url, userId).catch((err) => {
    console.error(`Error processing beat ${beatId}:`, err);
  });
});

/**
 * GET /api/status/:beatId
 *
 * Check processing status of a beat
 */
importRouter.get("/status/:beatId", async (req: Request, res: Response) => {
  const { beatId } = req.params;
  const apiKey = req.headers["x-api-key"] as string;

  if (!process.env.API_SECRET_KEY || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const beat = await getBeat(beatId);

    if (!beat) {
      return res.status(404).json({ error: "Beat not found" });
    }

    res.json({
      beatId,
      status: beat.status,
      audioUrl: beat.audioUrl || null,
      error: beat._processingError || null,
    });
  } catch (error) {
    console.error("Error checking status:", error);
    res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * POST /api/metadata
 *
 * Extract metadata from a URL without downloading audio
 */
importRouter.post("/metadata", async (req: Request, res: Response) => {
  const { url, apiKey } = req.body;

  if (!process.env.API_SECRET_KEY || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  try {
    const metadata = await getMetadataOnly(url);
    if (!metadata) {
      return res.status(404).json({ error: "Failed to extract metadata" });
    }
    res.json(metadata);
  } catch (error) {
    console.error("Error extracting metadata:", error);
    res.status(500).json({ error: "Failed to extract metadata" });
  }
});

/**
 * POST /api/search-metadata
 *
 * Search YouTube and return metadata for the first result
 */
importRouter.post("/search-metadata", async (req: Request, res: Response) => {
  const { query, apiKey } = req.body;

  if (!process.env.API_SECRET_KEY || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    const metadata = await searchYouTubeMetadata(query);
    if (!metadata) {
      return res.status(404).json({ error: "No results found" });
    }
    res.json(metadata);
  } catch (error) {
    console.error("Error searching metadata:", error);
    res.status(500).json({ error: "Failed to search metadata" });
  }
});

/**
 * POST /api/cleanup
 * 
 * Clean up any temporary files or related data for a beat
 */
importRouter.post("/cleanup", async (req: Request, res: Response) => {
  const { apiKey } = req.body;

  if (!process.env.API_SECRET_KEY || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Currently our temp files are self-cleaning via finally blocks.
  // This endpoint can be expanded if we add more persistent VPS state.
  res.json({ message: "Cleanup completed" });
});

/**
 * GET /api/health
 *
 * Check if yt-dlp is available
 */
importRouter.get("/health-detailed", async (req: Request, res: Response) => {
  const ytdlpInstalled = await checkYtdlpInstalled();

  res.json({
    status: ytdlpInstalled ? "ok" : "degraded",
    ytdlp: ytdlpInstalled,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Process import asynchronously
 */
export async function processImport(
  beatId: string,
  url: string,
  userId: string
): Promise<void> {
  let tempFilePath: string | null = null;

  try {
    console.log(`Starting import for beat ${beatId}: ${url}`);

    // Mark as processing
    await updateBeat(beatId, {
      status: "processing",
      _processingStartedAt: new Date(),
      _processingError: null,
    });

    // Download audio
    console.log(`Downloading audio...`);
    let downloadResult;

    if (validateBeatStarsUrl(url)) {
      // Resolve URL first (handles shortlinks and custom domains)
      const resolvedUrl = await resolveBeatStarsUrl(url);
      const trackId = extractBeatStarsTrackId(resolvedUrl);

      if (!trackId) {
        throw new Error(`Failed to extract BeatStars track ID from URL (Resolved: ${resolvedUrl})`);
      }

      // Try to get metadata first for a better title
      let bsMetadata = await scrapeBeatStarsMetadata(resolvedUrl);

      downloadResult = await downloadBeatStarsAudio(trackId, bsMetadata?.title);
      // Merge metadata if downloadResult has placeholders
      if (bsMetadata) {
        downloadResult.title = bsMetadata.title || downloadResult.title;
        downloadResult.artist = bsMetadata.artist;
      }
    } else {
      downloadResult = await downloadWithYtdlp(url);
    }

    const { filePath, duration, title, fileSize, artist: scrapedArtist } = downloadResult;
    tempFilePath = filePath;

    console.log(`Download complete: ${title} (${duration}s, ${fileSize} bytes)`);

    // Upload to Firebase Storage
    console.log(`Uploading to Firebase Storage...`);
    const { audioUrl } = await uploadToStorage(filePath, userId, beatId);

    // Get current beat to check if we should update the title
    const beat = await getBeat(beatId);
    const updateData: any = {
      audioUrl,
      fileSize,
      duration: Math.round(duration),
      status: "pending", // Ready to scan
      _importPending: false,
      _processingError: null,
    };

    // If the title is the placeholder, update it with the video title
    if (beat && (beat.title === "Processing Import..." || !beat.title)) {
      updateData.title = title;
    }

    // Also update artist if it's missing
    if (beat && !beat.artist && scrapedArtist) {
      updateData.artist = scrapedArtist;
    }

    await updateBeat(beatId, updateData);

    console.log(`Successfully processed beat ${beatId}`);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error(`Failed to process beat ${beatId}:`, error);

    // Update beat with error
    await updateBeat(beatId, {
      status: "failed",
      _importPending: false,
      _processingError: errorMessage,
    });
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }
  }
}
