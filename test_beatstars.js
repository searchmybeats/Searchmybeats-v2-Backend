const axios = require('axios');

async function test() {
    console.log('--- START TEST ---');
    const trackId = '15933118';
    const streamUrl = 'https://main.v2.beatstars.com/stream?id=' + trackId + '&return=audio';
    
    console.log('URL:', streamUrl);
    
    try {
        const response = await axios({
            method: 'get',
            url: streamUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.beatstars.com',
                'Referer': 'https://www.beatstars.com/',
                'Accept': '*/*',
            },
            maxRedirects: 0, // Let's check the redirect manually
            validateStatus: (status) => true,
        });
        
        console.log('Status:', response.status);
        console.log('Headers:', JSON.stringify(response.headers, null, 2));
        
        if (response.headers.location) {
            console.log('Redirect Location:', response.headers.location);
        }
    } catch (error) {
        console.log('ERROR:', error.message);
    }
    console.log('--- END TEST ---');
}

test();
