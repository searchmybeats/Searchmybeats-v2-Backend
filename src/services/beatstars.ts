import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuid } from 'uuid';
import { DownloadResult } from './ytdlp';

/**
 * Download audio from BeatStars using their internal stream API
 */
export async function downloadBeatStarsAudio(trackId: string, title?: string): Promise<DownloadResult> {
    const tempDir = os.tmpdir();
    const outputId = uuid();
    const filePath = path.join(tempDir, `smb_beatstars_${outputId}.mp3`);

    console.log(`[BeatStars] Downloading track ${trackId} to ${filePath}`);

    const streamUrl = `https://main.v2.beatstars.com/stream?id=${trackId}&return=audio`;

    try {
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.beatstars.com',
                'Referer': 'https://www.beatstars.com/',
                'Accept': '*/*',
            },
            maxRedirects: 5,
        } as any);

        const writer = fs.createWriteStream(filePath);
        (response.data as any).pipe(writer);

        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });

        const stats = fs.statSync(filePath);
        if (stats.size < 1000) {
            throw new Error('Downloaded file is too small, likely an error response');
        }

        return {
            filePath,
            duration: 0,
            title: title || `BeatStars Beat ${trackId}`,
            fileSize: stats.size,
        };
    } catch (error) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        throw error;
    }
}

/**
 * Resolves a BeatStars URL (handles shortlinks and custom domains)
 */
export async function resolveBeatStarsUrl(url: string): Promise<string> {
    console.log(`[BeatStars] Resolving URL: ${url}`);
    try {
        const response = await axios({
            method: 'get',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            maxRedirects: 5,
            validateStatus: (status: number) => status >= 200 && status < 400,
        } as any);

        const finalUrl = (response as any).request?.res?.responseUrl || url;
        console.log(`[BeatStars] Resolved to: ${finalUrl}`);
        return finalUrl;
    } catch (error) {
        console.warn(`[BeatStars] Failed to resolve URL ${url}, using as is:`, (error as Error).message);
        return url;
    }
}
