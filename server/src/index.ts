import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { db, initDb } from './db.js';
import { setupSocket } from './socket.js';
import roomsRouter from './routes/rooms.js';
import mediaRouter from './routes/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists for SQLite
const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
initDb();

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
app.use(express.json());
app.use(cookieParser());

// API routes
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

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`MovieMatcher server listening on port ${PORT}`);
});

export { app, httpServer, io };
