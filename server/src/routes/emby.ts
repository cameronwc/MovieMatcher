import { Router, type Request, type Response } from 'express';
import {
  validateEmbyConnection,
  fetchEmbyUsers,
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

// POST /api/emby/connect — connect to an Emby server with API key
router.post('/connect', async (req: Request, res: Response) => {
  try {
    // Block if any media server is already configured
    const existing = getMediaServerConfig();
    if (existing) {
      res.status(403).json({
        error: 'A media server is already configured. Use admin panel to disconnect first.',
      });
      return;
    }

    const { serverUrl, apiKey } = req.body as { serverUrl?: string; apiKey?: string };

    if (!serverUrl || !apiKey) {
      res.status(400).json({ error: 'serverUrl and apiKey are required' });
      return;
    }

    // Validate connection
    const { serverName } = await validateEmbyConnection(serverUrl, apiKey);

    // Fetch users
    const users = await fetchEmbyUsers(serverUrl, apiKey);

    if (users.length === 0) {
      res.status(400).json({ error: 'No users found on this Emby server' });
      return;
    }

    // Auto-select if single user, otherwise return list
    if (users.length === 1) {
      saveEmbyConfig({
        auth_token: apiKey,
        server_name: serverName,
        server_url: serverUrl.replace(/\/+$/, ''),
        user_id: users[0].id,
      });

      res.json({
        connected: true,
        serverName,
        serverUrl: serverUrl.replace(/\/+$/, ''),
      });
      return;
    }

    // Multiple users — return list for selection
    res.json({
      connected: false,
      serverName,
      users: users.map((u) => ({ id: u.id, name: u.name, isAdmin: u.isAdmin })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to connect to Emby';
    res.status(500).json({ error: message });
  }
});

// POST /api/emby/select-user — select an Emby user when multiple are available
router.post('/select-user', async (req: Request, res: Response) => {
  try {
    // Block if already configured
    const existing = getMediaServerConfig();
    if (existing) {
      res.status(403).json({
        error: 'A media server is already configured. Use admin panel to disconnect first.',
      });
      return;
    }

    const { serverUrl, apiKey, userId } = req.body as {
      serverUrl?: string;
      apiKey?: string;
      userId?: string;
    };

    if (!serverUrl || !apiKey || !userId) {
      res.status(400).json({ error: 'serverUrl, apiKey, and userId are required' });
      return;
    }

    // Re-validate connection
    const { serverName } = await validateEmbyConnection(serverUrl, apiKey);

    saveEmbyConfig({
      auth_token: apiKey,
      server_name: serverName,
      server_url: serverUrl.replace(/\/+$/, ''),
      user_id: userId,
    });

    res.json({
      connected: true,
      serverName,
      serverUrl: serverUrl.replace(/\/+$/, ''),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to select user';
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
