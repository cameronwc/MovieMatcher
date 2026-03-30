import { Router, type Request, type Response } from 'express';
import {
  validateEmbyServer,
  authenticateEmbyUser,
  saveEmbyConfig,
  getEmbyConfig,
} from '../services/embyAuth.js';
import { getMediaServerConfig, deleteMediaServerConfig } from '../services/plexAuth.js';
import { requireAdmin } from './admin.js';

const router = Router();

// GET /api/emby/status — check if Emby is configured
router.get('/status', (_req: Request, res: Response) => {
  const config = getEmbyConfig();
  if (config) {
    res.json({
      configured: true,
      serverName: config.server_name,
      serverUrl: config.server_url,
    });
  } else {
    res.json({ configured: false });
  }
});

// POST /api/emby/login — authenticate with local Emby username/password
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Block if any media server is already configured
    const existing = getMediaServerConfig();
    if (existing) {
      res.status(403).json({
        error: 'A media server is already configured. Use admin panel to disconnect first.',
      });
      return;
    }

    const { serverUrl, username, password } = req.body as {
      serverUrl?: string;
      username?: string;
      password?: string;
    };

    if (!serverUrl || !username) {
      res.status(400).json({ error: 'serverUrl and username are required' });
      return;
    }

    // Authenticate the local user
    const result = await authenticateEmbyUser(
      serverUrl,
      username,
      password || ''
    );

    saveEmbyConfig({
      auth_token: result.accessToken,
      server_name: result.serverName,
      server_url: serverUrl.replace(/\/+$/, ''),
      user_id: result.userId,
    });

    res.json({
      connected: true,
      serverName: result.serverName,
      serverUrl: serverUrl.replace(/\/+$/, ''),
      userName: result.userName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to connect to Emby';
    res.status(500).json({ error: message });
  }
});

// POST /api/emby/logout — clear Emby config (admin only)
router.post('/logout', requireAdmin, (_req: Request, res: Response) => {
  try {
    deleteMediaServerConfig();
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect Emby';
    res.status(500).json({ error: message });
  }
});

export default router;
