
import { spawn } from 'child_process';

/**
 * Scrapes the YouTube channel About page for social links and description
 * This is a fallback mechanism when yt-dlp fails to extract this data via the API/JSON dump
 */
export async function scrapeChannelSocials(channelId: string): Promise<{ links?: any[], description?: string }> {
    console.log(`[Scraper] Attempting fallback scrape for channel: ${channelId}`);

    const url = `https://www.youtube.com/channel/${channelId}/about`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!response.ok) {
            console.warn(`[Scraper] Failed to fetch channel page: ${response.status} ${response.statusText}`);
            return {};
        }

        const html = await response.text();
        const result: { links?: any[], description?: string } = {};

        // 1. Extract Description
        // Look for "description":{"simpleText":"..."} inside ytInitialData
        // This is a rough heuristic but often works for the main description block
        const descriptionMatch = html.match(/"description":\s*\{\s*"simpleText":\s*"(.*?)"/);
        if (descriptionMatch && descriptionMatch[1]) {
            // Decode unicode escapes if necessary (simple JSON.parse wrapper to unescape)
            try {
                result.description = JSON.parse(`"${descriptionMatch[1]}"`);
                console.log(`[Scraper] Found description via regex (${result.description?.length} chars)`);
            } catch (e) {
                // Fallback if JSON parse fails (e.g. unexpected quotes), just use raw string
                result.description = descriptionMatch[1];
            }
        }

        // 2. Extract Instagram Links (Regex Scan)
        // We prioritize Instagram as that's our main target
        const instagramMatches = [...html.matchAll(/instagram\.com\/([a-zA-Z0-9_.]+)/g)];

        if (instagramMatches.length > 0) {
            console.log(`[Scraper] Found ${instagramMatches.length} potential Instagram links via Regex scan`);

            const distinctHandles = new Set<string>();
            const links = [];

            for (const match of instagramMatches) {
                const handle = match[1];
                if (!distinctHandles.has(handle) && handle !== 'p' && handle !== 'reel' && handle !== 'stories') {
                    distinctHandles.add(handle);
                    links.push({
                        url: `https://instagram.com/${handle}`,
                        title: `Instagram (${handle})`
                    });
                }
            }

            if (links.length > 0) {
                result.links = links;
            }
        }

        return result;

    } catch (error) {
        console.error(`[Scraper] Error scraping channel ${channelId}:`, error);
        return {};
    }
}
