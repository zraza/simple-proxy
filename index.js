#!/usr/bin/env node


(async function (){
// Auto-install dependencies if missing
async function ensureDependencies() {
  try {
    require('express');
  } catch (error) {
    console.log('📦 Installing express...');
    const { execSync } = require('child_process');
    execSync('npm install express', { stdio: 'inherit' });
    console.log('✅ Express installed!');
  }
}

// Run dependency check
await ensureDependencies();

const express = require('express');
const { writeFile, readFile } = require('fs/promises');
const { createHash } = require('crypto');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5173;

const CACHE_DIR = path.resolve('./.cache');
const IMAGE_CACHE_DIR = path.join(CACHE_DIR, 'images');
const AUDIO_CACHE_DIR = path.join(CACHE_DIR, 'audios');
const VIDEO_CACHE_DIR = path.join(CACHE_DIR, 'videos');
const OTHER_CACHE_DIR = path.join(CACHE_DIR, 'others');

// In-memory cache for fast existence checks
const fileCache = new Map();

/**
 * Generate cache path with subdirectories for performance
 */
function getCachePath(url, contentType) {
  const hash = createHash('sha256').update(url).digest('hex');
  
  // Determine cache directory by content type
  let cacheDir = OTHER_CACHE_DIR;
  if (contentType.startsWith('image/')) {
    cacheDir = IMAGE_CACHE_DIR;
  } else if (contentType.startsWith('audio/')) {
    cacheDir = AUDIO_CACHE_DIR;
  } else if (contentType.startsWith('video/')) {
    cacheDir = VIDEO_CACHE_DIR;
  }
  
  // Add subdirectory for performance (first 2 chars of hash)
  const subDir = hash.substring(0, 2);
  const dir = path.join(cacheDir, subDir);
  
  return path.join(dir, hash);
}

app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('URL parameter required');
  }

  try {
    // Get content type first
    const headResponse = await fetch(targetUrl, { method: 'HEAD' });
    const contentType = headResponse.headers.get('Content-Type') || 'application/octet-stream';
    
    const cacheFile = getCachePath(targetUrl, contentType);

    // Fast cache check - memory first, then filesystem
    if (fileCache.get(cacheFile) || existsSync(cacheFile)) {
      fileCache.set(cacheFile, true);
      const cachedData = await readFile(cacheFile);
      
      res.set({
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000'
      });
      
      return res.send(cachedData);
    }

    // Fetch and cache
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch: ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const buffer = Buffer.from(data);

    // Ensure directory exists
    const dir = path.dirname(cacheFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Save to cache
    await writeFile(cacheFile, buffer);
    fileCache.set(cacheFile, true);

    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000'
    });
    
    res.send(buffer);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Failed to fetch');
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log(`Usage: http://localhost:${PORT}/api/proxy?url=YOUR_URL`);
});
})()