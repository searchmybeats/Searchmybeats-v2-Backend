# SMB Processor

Audio processing service for SearchMyBeats. Downloads audio from YouTube using yt-dlp, uploads to Firebase Storage, and updates Firestore.

## Requirements

- Node.js 18+
- yt-dlp installed globally
- ffmpeg (required by yt-dlp for audio conversion)
- Firebase project with Storage and Firestore

## Setup on VPS (Ubuntu/Debian)

### 1. Install system dependencies

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install ffmpeg
sudo apt install -y ffmpeg

# Install yt-dlp
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Verify installations
node --version
yt-dlp --version
ffmpeg -version
```

### 2. Clone and configure

```bash
# Clone the repository (or copy the smb-processor folder)
cd /opt
sudo mkdir smb-processor
sudo chown $USER:$USER smb-processor
cd smb-processor

# Copy project files here

# Install dependencies
npm install

# Create environment file
cp .env.example .env
nano .env  # Edit with your values
```

### 3. Configure environment variables

Edit `.env` with your Firebase credentials:

```bash
PORT=4000
API_SECRET_KEY=your-long-random-secret-key

# Get these from Firebase Console > Project Settings > Service Accounts
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

ALLOWED_ORIGINS=https://searchmybeats.com,http://localhost:3000
```

### 4. Build and test

```bash
# Build TypeScript
npm run build

# Test run
npm start

# Test health endpoint
curl http://localhost:4000/health
```

### 5. Production deployment with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create ecosystem config
cp ecosystem.config.example.js ecosystem.config.js
nano ecosystem.config.js  # Adjust if needed

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# (Follow the instructions it prints)
```

### 6. Configure nginx (optional but recommended)

```bash
sudo nano /etc/nginx/sites-available/smb-processor
```

```nginx
server {
    listen 80;
    server_name processor.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/smb-processor /etc/nginx/sites-enabled/

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Setup SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d processor.yourdomain.com
```

## API Endpoints

### POST /api/process-import

Process an audio import from YouTube.

**Request:**
```json
{
  "beatId": "abc123",
  "url": "https://www.youtube.com/watch?v=...",
  "userId": "user123",
  "apiKey": "your-api-secret-key"
}
```

**Response (202):**
```json
{
  "message": "Processing started",
  "beatId": "abc123"
}
```

### GET /api/status/:beatId

Check processing status.

**Headers:**
- `x-api-key`: Your API secret key

**Response:**
```json
{
  "beatId": "abc123",
  "status": "pending",
  "audioUrl": "https://storage.googleapis.com/...",
  "error": null
}
```

### GET /health

Basic health check.

### GET /api/health-detailed

Detailed health check including yt-dlp status.

## Vercel Configuration

Add these environment variables to your Vercel project:

```
VPS_PROCESSOR_URL=https://processor.yourdomain.com/api
VPS_API_KEY=your-api-secret-key
```

## Updating yt-dlp

YouTube frequently changes their site. Update yt-dlp regularly:

```bash
sudo yt-dlp -U
# or
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
```

## Troubleshooting

### yt-dlp download fails

1. Check yt-dlp version: `yt-dlp --version`
2. Update yt-dlp: `sudo yt-dlp -U`
3. Check if video is available: `yt-dlp --dump-json "URL"`
4. Check logs: `pm2 logs smb-processor`

### Firebase upload fails

1. Check credentials in `.env`
2. Verify Storage bucket permissions
3. Check Firestore rules allow writes

### PM2 issues

```bash
# View logs
pm2 logs smb-processor

# Restart service
pm2 restart smb-processor

# View status
pm2 status
```

## Security Notes

- Keep `API_SECRET_KEY` secure and unique
- Use HTTPS in production (nginx + Let's Encrypt)
- Restrict CORS origins to your domains only
- Keep yt-dlp updated to avoid security issues
- Monitor logs for suspicious activity
