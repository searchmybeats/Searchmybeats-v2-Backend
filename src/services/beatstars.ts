import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { DownloadResult } from './ytdlp';

/**
 * Download audio from BeatStars using their internal stream API with HLS fallback
 */
export async function downloadBeatStarsAudio(
    trackId: string,
    title?: string,
    options?: { cookies?: string, hlsUrl?: string }
): Promise<DownloadResult> {
    const tempDir = os.tmpdir();
    const outputId = uuid();
    const filePath = path.join(tempDir, `smb_beatstars_${outputId}.mp3`);

    console.log(`[BeatStars] Downloading track ${trackId} to ${filePath}`);

    const streamUrl = `https://main.v2.beatstars.com/stream?id=${trackId}&return=audio`;

    // Try Direct MP3 first
    try {
        console.log(`[BeatStars] Trying direct MP3 stream API...`);
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.beatstars.com',
                'Referer': 'https://www.beatstars.com/',
                'Accept': '*/*',
                'Cookie': options?.cookies || '',
                'Sec-Fetch-Dest': 'audio',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-site',
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
        if (stats.size > 10000) { // At least 10KB
            return {
                filePath,
                duration: 0,
                title: title || `BeatStars Beat ${trackId}`,
                fileSize: stats.size,
            };
        }
        console.warn(`[BeatStars] Direct MP3 too small (${stats.size} bytes), might be an error page.`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        console.warn(`[BeatStars] Direct MP3 download failed:`, (error as Error).message);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Fallback: HLS Stream (.m3u8)
    if (options?.hlsUrl) {
        console.log(`[BeatStars] Attempting HLS fallback: ${options.hlsUrl}`);
        try {
            await downloadWithFfmpeg(options.hlsUrl, filePath);
            const stats = fs.statSync(filePath);
            if (stats.size > 10000) {
                return {
                    filePath,
                    duration: 0,
                    title: title || `BeatStars Beat ${trackId}`,
                    fileSize: stats.size,
                };
            }
        } catch (error) {
            console.error(`[BeatStars] HLS fallback failed:`, (error as Error).message);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }

    throw new Error('BeatStars download failed after all attempts (Direct & HLS)');
}

/**
 * Downloads and converts HLS stream to MP3 using ffmpeg
 */
async function downloadWithFfmpeg(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // -i [URL] -c copy [OUTPUT] is fastest but Segment-based HLS to MP3 might need re-encoding
        const ffmpeg = spawn('ffmpeg', [
            '-i', url,
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            '-vn', // no video
            '-y', // overwrite
            outputPath
        ]);

        let errorLog = '';

        ffmpeg.stderr.on('data', (data) => {
            errorLog += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error(`[FFMPEG] Error log:`, errorLog);
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });
    });
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
