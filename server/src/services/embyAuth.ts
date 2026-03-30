import { db } from '../db.js';
import type { MediaServerConfig } from '../types.js';

interface EmbySystemInfo {
  ServerName: string;
  Version: string;
  Id: string;
}

interface EmbyUser {
  Id: string;
  Name: string;
  Policy: {
    IsAdministrator: boolean;
  };
}

function embyHeaders(apiKey: string): Record<string, string> {
  return {
    'X-Emby-Token': apiKey,
    Accept: 'application/json',
  };
}

/**
 * Validate connection to an Emby server using an API key.
 */
export async function validateEmbyConnection(
  serverUrl: string,
  apiKey: string
): Promise<{ serverName: string; serverId: string }> {
  const url = `${serverUrl.replace(/\/+$/, '')}/emby/System/Info`;
  const res = await fetch(url, { headers: embyHeaders(apiKey) });

  if (!res.ok) {
    throw new Error(`Failed to connect to Emby server: ${res.status} ${res.statusText}`);
  }

  const info = (await res.json()) as EmbySystemInfo;
  return { serverName: info.ServerName, serverId: info.Id };
}

/**
 * Fetch available users from an Emby server.
 */
export async function fetchEmbyUsers(
  serverUrl: string,
  apiKey: string
): Promise<Array<{ id: string; name: string; isAdmin: boolean }>> {
  const url = `${serverUrl.replace(/\/+$/, '')}/emby/Users`;
  const res = await fetch(url, { headers: embyHeaders(apiKey) });

  if (!res.ok) {
    throw new Error(`Failed to fetch Emby users: ${res.status} ${res.statusText}`);
  }

  const users = (await res.json()) as EmbyUser[];
  return users.map((u) => ({
    id: u.Id,
    name: u.Name,
    isAdmin: u.Policy.IsAdministrator,
  }));
}

/**
 * Save Emby config to database.
 */
export function saveEmbyConfig(config: {
  auth_token: string;
  server_name: string | null;
  server_url: string;
  user_id: string;
}): void {
  db.prepare(`
    INSERT INTO media_server_config (id, server_type, auth_token, server_name, server_url, user_id, updated_at)
    VALUES (1, 'emby', ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      server_type = 'emby',
      auth_token = excluded.auth_token,
      server_name = excluded.server_name,
      server_url = excluded.server_url,
      user_id = excluded.user_id,
      machine_id = NULL,
      updated_at = excluded.updated_at
  `).run(config.auth_token, config.server_name, config.server_url, config.user_id);
}

/**
 * Get saved Emby config (returns null if not configured or not Emby).
 */
export function getEmbyConfig(): MediaServerConfig | null {
  const row = db
    .prepare("SELECT * FROM media_server_config WHERE id = 1 AND server_type = 'emby'")
    .get() as MediaServerConfig | undefined;
  return row ?? null;
}
