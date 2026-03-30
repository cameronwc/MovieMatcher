import { db } from '../db.js';

const PLEX_CLIENT_ID = 'moviematcher-app';
const PLEX_PRODUCT = 'MovieMatcher';

interface PlexPin {
  id: number;
  code: string;
  authToken: string | null;
}

interface PlexResource {
  name: string;
  provides: string;
  clientIdentifier: string;
  connections: Array<{
    uri: string;
    local: boolean;
    relay: boolean;
    protocol: string;
  }>;
}

interface PlexConfig {
  auth_token: string;
  server_name: string | null;
  server_url: string;
  machine_id: string | null;
}

function plexHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Version': '1.0.0',
  };
  if (token) {
    headers['X-Plex-Token'] = token;
  }
  return headers;
}

/**
 * Step 1: Request a PIN from Plex
 */
export async function createPlexPin(): Promise<{ id: number; code: string }> {
  const res = await fetch('https://plex.tv/api/v2/pins', {
    method: 'POST',
    headers: {
      ...plexHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'strong=true',
  });

  if (!res.ok) {
    throw new Error(`Failed to create Plex PIN: ${res.status}`);
  }

  const data = await res.json() as PlexPin;
  return { id: data.id, code: data.code };
}

/**
 * Build the Plex auth URL the user should be redirected to
 */
export function getPlexAuthUrl(pinCode: string, forwardUrl: string): string {
  const params = new URLSearchParams({
    clientID: PLEX_CLIENT_ID,
    code: pinCode,
    forwardUrl,
    'context[device][product]': PLEX_PRODUCT,
    'context[device][version]': '1.0.0',
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/**
 * Step 2: Check if the user has authorized the PIN
 */
export async function checkPlexPin(pinId: number): Promise<string | null> {
  const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: plexHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to check Plex PIN: ${res.status}`);
  }

  const data = await res.json() as PlexPin;
  return data.authToken || null;
}

/**
 * Step 3: Discover the user's Plex servers
 */
export async function discoverPlexServers(
  authToken: string
): Promise<Array<{ name: string; machineId: string; connections: PlexResource['connections'] }>> {
  const res = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', {
    headers: plexHeaders(authToken),
  });

  if (!res.ok) {
    throw new Error(`Failed to discover Plex servers: ${res.status}`);
  }

  const resources = (await res.json()) as PlexResource[];

  return resources
    .filter((r) => r.provides.includes('server'))
    .map((r) => ({
      name: r.name,
      machineId: r.clientIdentifier,
      connections: r.connections,
    }));
}

/**
 * Test a connection URL to see if it's reachable
 */
async function testConnection(uri: string, token: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${uri}/identity`, {
      headers: plexHeaders(token),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Find the best working connection for a server
 */
export async function findBestConnection(
  connections: PlexResource['connections'],
  token: string
): Promise<string | null> {
  // Try local non-relay connections first, then remote, then relay
  const sorted = [...connections].sort((a, b) => {
    if (a.relay !== b.relay) return a.relay ? 1 : -1;
    if (a.local !== b.local) return a.local ? -1 : 1;
    return 0;
  });

  for (const conn of sorted) {
    if (await testConnection(conn.uri, token)) {
      return conn.uri;
    }
  }
  return null;
}

/**
 * Save Plex config to database
 */
export function savePlexConfig(config: PlexConfig): void {
  db.prepare(`
    INSERT INTO plex_config (id, auth_token, server_name, server_url, machine_id, updated_at)
    VALUES (1, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      auth_token = excluded.auth_token,
      server_name = excluded.server_name,
      server_url = excluded.server_url,
      machine_id = excluded.machine_id,
      updated_at = excluded.updated_at
  `).run(config.auth_token, config.server_name, config.server_url, config.machine_id);
}

/**
 * Get saved Plex config
 */
export function getPlexConfig(): PlexConfig | null {
  return (db.prepare('SELECT * FROM plex_config WHERE id = 1').get() as PlexConfig) ?? null;
}
