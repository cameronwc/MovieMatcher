import { getEmbyConfig } from './embyAuth.js';

interface EmbyLibrary {
  Name: string;
  ItemId: string;
  CollectionType: string;
}

interface EmbyItem {
  Id: string;
  Name: string;
  Type: string;
  CommunityRating?: number;
}

interface EmbyItemDetail {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  Overview?: string;
  CommunityRating?: number;
  OfficialRating?: string;
  Genres?: string[];
  RunTimeTicks?: number;
  ChildCount?: number;
  ImageTags?: { Primary?: string };
}

function getConfig() {
  const config = getEmbyConfig();
  if (config) {
    return {
      url: config.server_url.replace(/\/+$/, ''),
      apiKey: config.auth_token,
      userId: config.user_id!,
    };
  }
  throw new Error('Emby is not configured. Please connect to Emby first.');
}

function embyHeaders(apiKey: string): Record<string, string> {
  return {
    'X-Emby-Token': apiKey,
    Accept: 'application/json',
  };
}

function buildEmbyPosterUrl(itemId: string): string {
  return `/api/media/poster?source=emby&id=${encodeURIComponent(itemId)}`;
}

/**
 * Fetch Emby library virtual folders (filtered to movies/tvshows).
 */
export async function fetchEmbyLibraries(): Promise<Array<{ id: string; name: string; collectionType: string }>> {
  const { url, apiKey } = getConfig();
  const res = await fetch(`${url}/emby/Library/VirtualFolders`, {
    headers: embyHeaders(apiKey),
  });

  if (!res.ok) {
    throw new Error(`Emby API error fetching libraries: ${res.status} ${res.statusText}`);
  }

  const folders = (await res.json()) as EmbyLibrary[];

  return folders
    .filter((f) => f.CollectionType === 'movies' || f.CollectionType === 'tvshows')
    .map((f) => ({
      id: f.ItemId,
      name: f.Name,
      collectionType: f.CollectionType,
    }));
}

/**
 * Fetch items from an Emby library (lightweight: Id + CommunityRating + Type).
 */
export async function fetchEmbyLibraryItems(
  parentId: string
): Promise<Array<{ id: string; rating: number | null; type: string }>> {
  const { url, apiKey, userId } = getConfig();
  const params = new URLSearchParams({
    ParentId: parentId,
    IncludeItemTypes: 'Movie,Series',
    Recursive: 'true',
    Fields: 'CommunityRating',
    StartIndex: '0',
    Limit: '10000',
  });

  const res = await fetch(`${url}/emby/Users/${userId}/Items?${params}`, {
    headers: embyHeaders(apiKey),
  });

  if (!res.ok) {
    throw new Error(`Emby API error fetching library items: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { Items: EmbyItem[] };

  return (data.Items ?? []).map((item) => ({
    id: item.Id,
    rating: item.CommunityRating ?? null,
    type: item.Type === 'Series' ? 'show' : 'movie',
  }));
}

/**
 * Fetch full metadata for a single Emby item.
 */
export async function fetchEmbyItemMetadata(itemId: string): Promise<{
  source: 'emby';
  source_id: string;
  type: 'movie' | 'show';
  title: string;
  year: number | null;
  summary: string | null;
  poster_url: string | null;
  rating: number | null;
  genre: string | null;
  duration: number | null;
  content_rating: string | null;
  episode_count: number | null;
}> {
  const { url, apiKey, userId } = getConfig();
  const res = await fetch(`${url}/emby/Users/${userId}/Items/${itemId}`, {
    headers: embyHeaders(apiKey),
  });

  if (!res.ok) {
    throw new Error(`Emby API error fetching metadata for ${itemId}: ${res.status} ${res.statusText}`);
  }

  const item = (await res.json()) as EmbyItemDetail;

  const mediaType = item.Type === 'Series' ? 'show' : 'movie';
  const genres = item.Genres?.join(', ') ?? null;
  const posterUrl = item.ImageTags?.Primary ? buildEmbyPosterUrl(item.Id) : null;
  // RunTimeTicks is in 100-nanosecond intervals; convert to minutes
  const durationMinutes = item.RunTimeTicks
    ? Math.round(item.RunTimeTicks / 600000000)
    : null;

  return {
    source: 'emby',
    source_id: item.Id,
    type: mediaType,
    title: item.Name,
    year: item.ProductionYear ?? null,
    summary: item.Overview ?? null,
    poster_url: posterUrl,
    rating: item.CommunityRating ?? null,
    genre: genres,
    duration: durationMinutes,
    content_rating: item.OfficialRating ?? null,
    episode_count: item.ChildCount ?? null,
  };
}
