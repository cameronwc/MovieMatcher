import { db } from '../db.js';
import type { MediaServerConfig } from '../types.js';

interface EmbySystemInfo {
  ServerName: string;
  Version: string;
  Id: string;
}

interface EmbyAuthResult {
  AccessToken: string;
  User: {
    Id: string;
    Name: string;
    Policy: {
      IsAdministrator: boolean;
    };
  };
  ServerId: string;
}

const EMBY_CLIENT = 'MovieMatcher';
const EMBY_DEVICE = 'Web';
const EMBY_DEVICE_ID = 'moviematcher-app';
const EMBY_VERSION = '1.0.0';

function embyAuthHeader(): string {
  return `Emby Client="${EMBY_CLIENT}", Device="${EMBY_DEVICE}", DeviceId="${EMBY_DEVICE_ID}", Version="${EMBY_VERSION}"`;
}

/**
 * Validate connection to an Emby server (unauthenticated public info).
 */
export async function validateEmbyServer(
  serverUrl: string
): Promise<{ serverName: string; serverId: string }> {
  const url = `${serverUrl.replace(/\/+$/, '')}/emby/System/Info/Public`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to connect to Emby server: ${res.status} ${res.statusText}`);
  }

  const info = (await res.json()) as EmbySystemInfo;
  return { serverName: info.ServerName, serverId: info.Id };
}

/**
 * Authenticate a local Emby user by username and password.
 * Uses the AuthenticateByName endpoint which returns an access token.
 */
export async function authenticateEmbyUser(
  serverUrl: string,
  username: string,
  password: string
): Promise<{ accessToken: string; userId: string; userName: string; serverName: string }> {
  const normalizedUrl = serverUrl.replace(/\/+$/, '');

  // First get server info
  const { serverName } = await validateEmbyServer(normalizedUrl);

  // Authenticate by username/password
  const res = await fetch(`${normalizedUrl}/emby/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Emby-Authorization': embyAuthHeader(),
    },
    body: JSON.stringify({
      Username: username,
      Pw: password,
    }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw new Error(`Emby authentication failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as EmbyAuthResult;

  return {
    accessToken: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name,
    serverName,
  };
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
