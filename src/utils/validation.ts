/**
 * Validate YouTube URL format
 */
export function validateYouTubeUrl(url: string): boolean {
  const patterns = [
    // Standard watch URL
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    // Short URL
    /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
    // Shorts URL
    /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
    // Music URL
    /^(https?:\/\/)?(music\.)?youtube\.com\/watch\?v=[\w-]+/,
  ];

  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Validate BeatStars URL format
 */
export function validateBeatStarsUrl(url: string): boolean {
  try {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("bsta.rs")) return true;
    if (lowerUrl.includes("beatstars.com")) return true;

    // Heuristic for custom domains: must have /beat/ or /track/ in path
    const parsedUrl = new URL(url);
    return (
      parsedUrl.pathname.includes("/beat/") || parsedUrl.pathname.includes("/track/")
    );
  } catch {
    return /beatstars\.com|bsta\.rs/.test(url);
  }
}

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract track ID from BeatStars URL
 */
export function extractBeatStarsTrackId(url: string): string | null {
  // Pattern 1: /beat/title-alias-ID or /beat/ID
  // Also handles trailing slashes
  const match = url.match(/\/beat\/(?:.*-)?(\d+)\/?$/);
  if (match && match[1]) {
    return match[1];
  }

  // Pattern 2: /TK/ID
  const tkMatch = url.match(/\/TK\/(\d+)\/?/i);
  if (tkMatch && tkMatch[1]) {
    return tkMatch[1];
  }

  return null;
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 100);
}
