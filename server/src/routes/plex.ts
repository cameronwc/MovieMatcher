import { Router, type Request, type Response } from 'express';
import {
  createPlexPin,
  getPlexAuthUrl,
  checkPlexPin,
  discoverPlexServers,
  findBestConnection,
  savePlexConfig,
  getPlexConfig,
  getMediaServerConfig,
  deleteMediaServerConfig,
} from '../services/plexAuth.js';
import { requireAdmin } from './admin.js';

const router = Router();

// GET /api/plex/status — check if Plex is configured
router.get('/status', (_req: Request, res: Response) => {
  const config = getPlexConfig();
  if (config) {
    res.json({
      configured: true,
      serverName: config.server_name,
      serverUrl: config.server_url,
    });
  } else if (process.env.PLEX_URL && process.env.PLEX_TOKEN) {
    res.json({
      configured: true,
      serverName: 'Environment Config',
      serverUrl: process.env.PLEX_URL,
    });
  } else {
    res.json({ configured: false });
  }
});

// GET /api/plex/media-server-status — unified status for any configured media server
router.get('/media-server-status', (_req: Request, res: Response) => {
  const config = getMediaServerConfig();
  if (config) {
    res.json({
      configured: true,
      serverType: config.server_type,
      serverName: config.server_name,
      serverUrl: config.server_url,
    });
  } else if (process.env.PLEX_URL && process.env.PLEX_TOKEN) {
    res.json({
      configured: true,
      serverType: 'plex',
      serverName: 'Environment Config',
      serverUrl: process.env.PLEX_URL,
    });
  } else {
    res.json({ configured: false, serverType: null });
  }
});

// POST /api/plex/pin — create a Plex PIN for OAuth
router.post('/pin', async (_req: Request, res: Response) => {
  try {
    const pin = await createPlexPin();
    res.json(pin);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create PIN';
    res.status(500).json({ error: message });
  }
});

// GET /api/plex/auth-url — get the Plex auth URL for a PIN
router.get('/auth-url', (req: Request, res: Response) => {
  const code = req.query.code as string;
  const forwardUrl = req.query.forwardUrl as string;
  if (!code || !forwardUrl) {
    res.status(400).json({ error: 'code and forwardUrl are required' });
    return;
  }
  const authUrl = getPlexAuthUrl(code, forwardUrl);
  res.json({ authUrl });
});

// POST /api/plex/check-pin — check if a PIN has been authorized
router.post('/check-pin', async (req: Request, res: Response) => {
  try {
    // Prevent reconfiguration if any media server is already set up
    const existingConfig = getMediaServerConfig();
    if (existingConfig) {
      res.status(403).json({ error: 'A media server is already configured. Use admin panel to reconfigure.' });
      return;
    }

    const { pinId } = req.body as { pinId: number };
    if (!pinId) {
      res.status(400).json({ error: 'pinId is required' });
      return;
    }

    const authToken = await checkPlexPin(pinId);
    if (!authToken) {
      res.json({ authorized: false });
      return;
    }

    // Discover servers
    const servers = await discoverPlexServers(authToken);
    if (servers.length === 0) {
      res.status(400).json({ error: 'No Plex servers found on this account' });
      return;
    }

    // If only one server, auto-select it
    if (servers.length === 1) {
      const server = servers[0];
      const bestUrl = await findBestConnection(server.connections, authToken);

      if (!bestUrl) {
        res.status(400).json({ error: 'Could not connect to your Plex server. All connection URLs failed.' });
        return;
      }

      savePlexConfig({
        auth_token: authToken,
        server_name: server.name,
        server_url: bestUrl,
        machine_id: server.machineId,
      });

      res.json({
        authorized: true,
        serverName: server.name,
        serverUrl: bestUrl,
      });
      return;
    }

    // Multiple servers — return the list for the user to pick
    res.json({
      authorized: true,
      servers: servers.map((s) => ({
        name: s.name,
        machineId: s.machineId,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check PIN';
    res.status(500).json({ error: message });
  }
});

// POST /api/plex/select-server — select a server when multiple are available
router.post('/select-server', async (req: Request, res: Response) => {
  try {
    // Prevent reconfiguration if any media server is already set up
    const existingConfig = getMediaServerConfig();
    if (existingConfig) {
      res.status(403).json({ error: 'A media server is already configured. Use admin panel to reconfigure.' });
      return;
    }

    const { pinId, machineId } = req.body as { pinId: number; machineId: string };

    const authToken = await checkPlexPin(pinId);
    if (!authToken) {
      res.status(401).json({ error: 'PIN not authorized' });
      return;
    }

    const servers = await discoverPlexServers(authToken);
    const server = servers.find((s) => s.machineId === machineId);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const bestUrl = await findBestConnection(server.connections, authToken);
    if (!bestUrl) {
      res.status(400).json({ error: 'Could not connect to your Plex server' });
      return;
    }

    savePlexConfig({
      auth_token: authToken,
      server_name: server.name,
      server_url: bestUrl,
      machine_id: server.machineId,
    });

    res.json({
      serverName: server.name,
      serverUrl: bestUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to select server';
    res.status(500).json({ error: message });
  }
});

// POST /api/plex/logout — clear media server config (admin only)
router.post('/logout', requireAdmin, (_req: Request, res: Response) => {
  try {
    deleteMediaServerConfig();
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to logout';
    res.status(500).json({ error: message });
  }
});

export default router;
