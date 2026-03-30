import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { db, initDb } from './db.js';
import { setupSocket } from './socket.js';
import { getPlexConfig } from './services/plexAuth.js';
import roomsRouter from './routes/rooms.js';
import mediaRouter from './routes/media.js';
import plexRouter from './routes/plex.js';
import adminRouter from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists for SQLite
const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
initDb();

// C4: Admin password warning at startup
if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD not set. Using default password. Set ADMIN_PASSWORD env var for production.');
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// Set up Socket.IO
const io = setupSocket(httpServer);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Request logging
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// I6: Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Poster image proxy — serves Plex poster images without exposing the token
// SSRF protection: only allow Plex metadata thumb paths
app.get('/api/media/poster', async (req, res) => {
  try {
    const thumbUrl = req.query.url as string;
    if (!thumbUrl) { res.status(400).end(); return; }
    // Validate URL is a Plex metadata thumb path (prevent SSRF)
    if (!thumbUrl.startsWith('/library/metadata/')) {
      res.status(400).json({ error: 'Invalid thumb URL' });
      return;
    }
    const config = getPlexConfig();
    const plexUrl = config?.server_url || process.env.PLEX_URL;
    const plexToken = config?.auth_token || process.env.PLEX_TOKEN;
    if (!plexUrl || !plexToken) { res.status(503).end(); return; }
    const imageUrl = `${plexUrl}/photo/:/transcode?width=400&height=600&minSize=1&url=${encodeURIComponent(thumbUrl)}&X-Plex-Token=${plexToken}`;
    const response = await fetch(imageUrl);
    if (!response.ok) { res.status(response.status).end(); return; }
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).end();
  }
});

// API routes
app.use('/api/plex', plexRouter);
app.use('/api/admin', adminRouter);
app.use('/api/rooms', roomsRouter);
// Media routes are mounted under /api/rooms because they use :code param
app.use('/api/rooms', mediaRouter);

// Serve static files from client/dist in production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback: for any non-API route, serve index.html
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API endpoint not found' });
      return;
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// I1: Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`MovieMatcher server listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DB_PATH || './data/moviematcher.db'}`);
});

export { app, httpServer, io };
