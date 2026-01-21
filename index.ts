import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { fetchYouTubeVideos } from './youtube';
import {
    fetchYouTubeVideosAuto,
    startYouTubeAutoRefresh
  } from "./youtube";
  

// Get the directory of the current module (server/index.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env file
// Use path.resolve to get absolute path to .env in the same directory as index.ts
const envPath = resolve(__dirname, '.env');
const result = dotenv.config({ path: envPath });

// Log dotenv loading result for debugging
if (result.error) {
  console.error('[dotenv] ERROR: Could not load .env file:', result.error.message);
  console.error('[dotenv] Attempted path:', envPath);
  console.error('[dotenv] Current working directory:', process.cwd());
  console.error('[dotenv] Please ensure server/.env file exists with:');
  console.error('[dotenv]   YOUTUBE_API_KEY=your_api_key_here');
  console.error('[dotenv]   YOUTUBE_CHANNEL_HANDLE=HEALTHBOOK.OFFICIAL');
  console.error('[dotenv]   PORT=3002');
} else {
  console.log('[dotenv] Successfully loaded .env file from:', envPath);
}

// Log environment variables status (without exposing values)
console.log('[dotenv] Environment variables status:');
console.log('  YOUTUBE_API_KEY:', process.env.YOUTUBE_API_KEY ? `Set (${process.env.YOUTUBE_API_KEY.length} chars)` : 'NOT SET');
console.log('  YOUTUBE_CHANNEL_HANDLE:', process.env.YOUTUBE_CHANNEL_HANDLE ? `Set (${process.env.YOUTUBE_CHANNEL_HANDLE})` : 'NOT SET');
console.log('  PORT:', process.env.PORT || '3002 (default)');

// YouTube API Key Requirements Notice
if (process.env.YOUTUBE_API_KEY) {
  console.log('');
  console.log('📋 YouTube API Key Requirements:');
  console.log('   ⚠️  IMPORTANT: Your YouTube API key must have "YouTube Data API v3" enabled');
  console.log('   📍 Enable it at: https://console.cloud.google.com/apis/library/youtube.googleapis.com');
  console.log('   🔒 API key restrictions (IP, HTTP referrer, etc.) can cause 400 INVALID_ARGUMENT errors');
  console.log('   💡 If you see "API key not valid" errors, check:');
  console.log('      1. YouTube Data API v3 is enabled for your project');
  console.log('      2. API key restrictions allow requests from this server');
  console.log('      3. API key has proper permissions/quota');
  console.log('');
}

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Environment variables validation endpoint (for debugging)
app.get('/api/debug/env', (req, res) => {
  const hasApiKey = !!process.env.YOUTUBE_API_KEY;
  const hasChannelHandle = !!process.env.YOUTUBE_CHANNEL_HANDLE;
  const apiKeyLength = process.env.YOUTUBE_API_KEY?.length || 0;
  const channelHandle = process.env.YOUTUBE_CHANNEL_HANDLE || 'NOT SET';

  res.json({
    hasApiKey,
    hasChannelHandle,
    apiKeyLength,
    channelHandle: channelHandle.length > 20 ? channelHandle.substring(0, 20) + '...' : channelHandle,
    port: PORT
  });
});

// YouTube videos endpoint
app.get('/api/youtube/videos', async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    const channelHandle = process.env.YOUTUBE_CHANNEL_HANDLE?.trim();

    // Validate environment variables with detailed error messages
    if (!apiKey) {
      console.error('[API] Missing YOUTUBE_API_KEY environment variable');
      return res.status(400).json({ 
        error: 'Configuration Error',
        message: 'YOUTUBE_API_KEY environment variable is missing. Please set it in your .env file.',
        details: 'The YouTube API key is required to fetch videos from your channel.'
      });
    }

    if (!channelHandle) {
      console.error('[API] Missing YOUTUBE_CHANNEL_HANDLE environment variable');
      return res.status(400).json({ 
        error: 'Configuration Error',
        message: 'YOUTUBE_CHANNEL_HANDLE environment variable is missing. Please set it in your .env file.',
        details: 'The YouTube channel handle (e.g., HEALTHBOOK.OFFICIAL) is required to identify which channel to fetch videos from.'
      });
    }

    if (apiKey.length < 20) {
      console.error('[API] YOUTUBE_API_KEY appears to be invalid (too short)');
      return res.status(400).json({ 
        error: 'Invalid API Key',
        message: 'YOUTUBE_API_KEY appears to be invalid. Please check your .env file.',
        details: 'YouTube API keys are typically longer than 20 characters.'
      });
    }

    console.log('[API] Fetching YouTube videos...');
    const videos = await fetchYouTubeVideos(apiKey, channelHandle);
    
    console.log('[API] Successfully fetched videos:', {
      heroVideo: videos.heroVideo ? 'Yes' : 'No',
      longVideos: videos.longVideos.length,
      shorts: videos.shorts.length
    });

    res.json(videos);
  } catch (error) {
    console.error('[API] Error in /api/youtube/videos endpoint:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const statusCode = errorMessage.includes('Configuration') || errorMessage.includes('missing') ? 400 : 500;
    
    res.status(statusCode).json({ 
      error: 'Failed to fetch YouTube videos',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // ✅ Start YouTube auto refresh AFTER server starts
  startYouTubeAutoRefresh(
    process.env.YOUTUBE_API_KEY!,
    process.env.YOUTUBE_CHANNEL_HANDLE!
  );

}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!\n`);
    console.log('To fix this, you can:');
    console.log(`1. Stop the process using port ${PORT}:`);
    console.log(`   Windows: netstat -ano | findstr :${PORT}`);
    console.log('   Then: taskkill /PID <PID> /F');
    console.log('2. Or use a different port by setting PORT environment variable\n');
    process.exit(1);
  } else {
    throw err;
  }
});


