import { getPlexConfig } from './plexAuth.js';

interface PlexSection {
  key: string;
  type: string;
  title: string;
}

interface PlexLibraryItem {
  ratingKey: string;
  rating?: number | null;
  audienceRating?: number | null;
  type: string;
}

interface PlexMetadata {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  summary?: string;
  thumb?: string;
  rating?: number;
  audienceRating?: number;
  Genre?: Array<{ tag: string }>;
  duration?: number;
  contentRating?: string;
  leafCount?: number;
}

function getConfig() {
  // Check DB config first, fall back to env vars
  const dbConfig = getPlexConfig();
  if (dbConfig) {
    return { url: dbConfig.server_url, token: dbConfig.auth_token };
  }
  const url = process.env.PLEX_URL;
  const token = process.env.PLEX_TOKEN;
  if (url && token) {
    return { url, token };
  }
  throw new Error('Plex is not configured. Please sign in with Plex first.');
}

function plexHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'moviematcher-app',
    'X-Plex-Product': 'MovieMatcher',
  };
}

function buildPosterUrl(thumb: string): string {
  return `/api/media/poster?url=${encodeURIComponent(thumb)}`;
}

export async function fetchLibrarySections(): Promise<PlexSection[]> {
  const { url, token } = getConfig();
  const res = await fetch(`${url}/library/sections`, { headers: plexHeaders(token) });

  if (!res.ok) {
    throw new Error(`Plex API error fetching sections: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const directories = data?.MediaContainer?.Directory ?? [];

  return directories
    .filter((d: PlexSection) => d.type === 'movie' || d.type === 'show')
    .map((d: PlexSection) => ({
      key: d.key,
      type: d.type,
      title: d.title,
    }));
}

export async function fetchLibraryItems(sectionId: string): Promise<PlexLibraryItem[]> {
  const { url, token } = getConfig();
  const res = await fetch(`${url}/library/sections/${sectionId}/all`, {
    headers: plexHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Plex API error fetching section ${sectionId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items = data?.MediaContainer?.Metadata ?? [];

  return items.map((item: PlexLibraryItem) => ({
    ratingKey: item.ratingKey,
    rating: item.audienceRating ?? item.rating ?? null,
    type: item.type,
  }));
}

export async function fetchItemMetadata(ratingKey: string): Promise<{
  plex_rating_key: string;
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
  const { url, token } = getConfig();
  const res = await fetch(`${url}/library/metadata/${ratingKey}`, {
    headers: plexHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Plex API error fetching metadata for ${ratingKey}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const metadata: PlexMetadata = data?.MediaContainer?.Metadata?.[0];

  if (!metadata) {
    throw new Error(`No metadata found for ratingKey ${ratingKey}`);
  }

  const mediaType = metadata.type === 'show' ? 'show' : 'movie';
  const genres = metadata.Genre?.map((g) => g.tag).join(', ') ?? null;
  const posterUrl = metadata.thumb ? buildPosterUrl(metadata.thumb) : null;
  const durationMinutes = metadata.duration ? Math.round(metadata.duration / 60000) : null;
  // Use audienceRating (Rotten Tomatoes) if available, fall back to rating
  const rating = metadata.audienceRating ?? metadata.rating ?? null;

  return {
    plex_rating_key: metadata.ratingKey,
    type: mediaType,
    title: metadata.title,
    year: metadata.year ?? null,
    summary: metadata.summary ?? null,
    poster_url: posterUrl,
    rating,
    genre: genres,
    duration: durationMinutes,
    content_rating: metadata.contentRating ?? null,
    episode_count: metadata.leafCount ?? null,
  };
}
