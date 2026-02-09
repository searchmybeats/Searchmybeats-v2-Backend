import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { DownloadResult } from './ytdlp';

const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

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

    // Try Direct MP3 first with multiple User-Agents
    for (const ua of USER_AGENTS) {
        try {
            console.log(`[BeatStars] Trying direct MP3 stream API with UA: ${ua.substring(0, 30)}...`);
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': ua,
                    'Origin': 'https://www.beatstars.com',
                    'Referer': 'https://www.beatstars.com/',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': options?.cookies || '',
                    'Sec-Fetch-Dest': 'audio',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'same-site',
                    'Connection': 'keep-alive',
                },
                maxRedirects: 10,
                timeout: 30000,
            } as any);

            const writer = fs.createWriteStream(filePath);
            (response.data as any).pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
                // Fail if timeout or no data for 10s
                setTimeout(() => reject(new Error('Download timeout')), 60000);
            });

            const stats = fs.statSync(filePath);
            // Verify if it's a real audio file (not a small JSON/HTML error page)
            if (stats.size > 20000) { // At least 20KB for a preview
                return {
                    filePath,
                    duration: 0,
                    title: title || `BeatStars Beat ${trackId}`,
                    fileSize: stats.size,
                };
            }

            console.warn(`[BeatStars] Downloaded file too small (${stats.size} bytes). Content might be blocked.`);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (error) {
            console.warn(`[BeatStars] Attempt failed with UA: ${ua.substring(0, 20)}... Error:`, (error as Error).message);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }

    // Fallback: HLS Stream (.m3u8)
    if (options?.hlsUrl) {
        console.log(`[BeatStars] Attempting HLS fallback: ${options.hlsUrl}`);
        try {
            await downloadWithFfmpeg(options.hlsUrl, filePath, options.cookies);
            const stats = fs.statSync(filePath);
            if (stats.size > 20000) {
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

    throw new Error('BeatStars download failed after all attempts (Direct & HLS). This usually indicates a strong bot-block on the server IP.');
}

/**
 * Downloads and converts HLS stream to MP3 using ffmpeg
 */
async function downloadWithFfmpeg(url: string, outputPath: string, cookies?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-headers', `User-Agent: ${USER_AGENTS[0]}\r\nReferer: https://www.beatstars.com/\r\nCookie: ${cookies || ''}\r\n`,
            '-i', url,
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            '-vn',
            '-y',
            outputPath
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

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
