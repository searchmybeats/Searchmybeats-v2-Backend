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
  return /^(https?:\/\/)?(www\.)?beatstars\.com\//.test(url);
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
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 100);
}
