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
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });

        const stats = fs.statSync(filePath);
        if (stats.size < 1000) {
            throw new Error('Downloaded file is too small, likely an error response');
        }

        // Duration is harder to get without ffprobe or downloading metadata
        // For now, let's just return a placeholder or try to get it if we can find it
        return {
            filePath,
            duration: 0, // Will be updated if possible or handled as 0
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
