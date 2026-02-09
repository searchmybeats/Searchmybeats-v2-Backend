
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
        const descriptionMatch = html.match(/"description":\s*\{\s*"simpleText":\s*"(.*?)"/);
        if (descriptionMatch && descriptionMatch[1]) {
            try {
                result.description = JSON.parse(`"${descriptionMatch[1]}"`);
                console.log(`[Scraper] Found description via regex (${result.description?.length} chars)`);
            } catch (e) {
                result.description = descriptionMatch[1];
            }
        }

        // 2. Extract Instagram Links (Regex Scan)
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

/**
 * Scrapes BeatStars page for metadata and stream URLs
 */
export async function scrapeBeatStarsMetadata(url: string): Promise<{ title?: string, artist?: string, hlsUrl?: string, cookies?: string } | null> {
    console.log(`[Scraper] Attempting metadata scrape for BeatStars: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!response.ok) return null;

        // Extract all cookies from set-cookie headers
        const cookieHeaders = (response.headers as any).getSetCookie ? (response.headers as any).getSetCookie() : [];
        const cookies = cookieHeaders.map((c: string) => c.split(';')[0]).join('; ');

        const html = await response.text();

        // 1. Extract JSON Data (BeatStars often embeds a large JSON object with track details)
        let jsonData: any = null;
        const jsonMatch = html.match(/<script\s+id="bs-data"\s+type="application\/json">(.*?)<\/script>/s) ||
            html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);

        if (jsonMatch) {
            try {
                // Remove potential excessive escaping if it's inside a string/comment
                let cleanJson = jsonMatch[1].trim();
                jsonData = JSON.parse(cleanJson);
                console.log(`[Scraper] Successfully parsed JSON data from page`);
            } catch (e) {
                console.warn(`[Scraper] Failed to parse JSON data regex match`);
            }
        }

        // 2. Extract Title
        let title = jsonData?.track?.title || jsonData?.track?.name || jsonData?.track?.track_name;

        // If no title in JSON or it's a generic placeholder, try meta tags
        const genericTitles = ["buy beats online", "beatstars", "beatstars.com", "home | beatstars"];
        const isGeneric = (t: string) => genericTitles.some(g => t.toLowerCase().includes(g));

        if (!title || isGeneric(title)) {
            const titleMatch = html.match(/<meta\s+property="og:title"\s+content="(.*?)"/i) ||
                html.match(/<meta\s+name="twitter:title"\s+content="(.*?)"/i) ||
                html.match(/<title>(.*?)<\/title>/i);
            const candidate = titleMatch?.[1] || "";
            if (candidate && !isGeneric(candidate)) {
                title = candidate;
            }
        }

        // Final fallback: Extract from URL slug if still generic or empty
        if (!title || isGeneric(title)) {
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/');
                // BeatStars URLs are usually /beat/[slug]-[id]
                const slugPart = pathParts.find(p => p.includes('-')) || pathParts[2];
                if (slugPart) {
                    // Extract name by removing ID suffix if possible
                    title = slugPart.replace(/-\d+$/, '').replace(/-/g, ' ');
                    title = title.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    console.log(`[Scraper] Fallback to URL slug title: ${title}`);
                }
            } catch (e) {
                console.warn(`[Scraper] Failed to extract title from URL slug`);
            }
        }

        if (title) {
            title = title.split('|')[0].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
            if (title.toLowerCase().endsWith('- beatstars')) {
                title = title.substring(0, title.length - 11).trim();
            }
        }

        // 3. Extract Artist
        let artist = jsonData?.track?.artist?.name || jsonData?.track?.display_name || jsonData?.track?.artist?.display_name;
        if (!artist) {
            const artistMatch = html.match(/<meta\s+name="author"\s+content="(.*?)"/i) ||
                html.match(/<meta\s+property="og:description"\s+content=".*?by\s+(.*?)\.\s/i);
            artist = artistMatch?.[1] || undefined;
        }

        // 4. Extract HLS Stream URL (.m3u8)
        let hlsUrl = jsonData?.track?.hls_url || jsonData?.track?.streams?.hls || jsonData?.track?.stream_url;
        if (!hlsUrl) {
            const hlsMatch = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i) ||
                html.match(/"hlsUrl":\s*"(.*?)"/);
            hlsUrl = hlsMatch?.[1] || hlsMatch?.[0];
        }

        return {
            title,
            artist,
            hlsUrl,
            cookies
        };
    } catch (error) {
        console.error(`[Scraper] Error scraping BeatStars ${url}:`, error);
        return null;
    }
}
