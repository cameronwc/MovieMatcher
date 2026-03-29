const PLEX_URL = () => process.env.PLEX_URL || 'http://localhost:32400';
const PLEX_TOKEN = () => process.env.PLEX_TOKEN || '';

interface PlexSection {
  key: string;
  type: string; // 'movie' | 'show' | 'artist' etc.
  title: string;
}

interface PlexLibraryItem {
  ratingKey: string;
  rating?: number | null;
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
  Genre?: Array<{ tag: string }>;
  duration?: number;
  contentRating?: string;
  leafCount?: number; // episode count for TV shows
}

function plexHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Token': PLEX_TOKEN(),
  };
}

function buildPosterUrl(thumb: string): string {
  const url = PLEX_URL();
  const token = PLEX_TOKEN();
  return `${url}/photo/:/transcode?width=400&height=600&minSize=1&url=${encodeURIComponent(thumb)}&X-Plex-Token=${token}`;
}

export async function fetchLibrarySections(): Promise<PlexSection[]> {
  const url = `${PLEX_URL()}/library/sections`;
  const res = await fetch(url, { headers: plexHeaders() });

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

export async function fetchLibraryItems(
  sectionId: string
): Promise<PlexLibraryItem[]> {
  const url = `${PLEX_URL()}/library/sections/${sectionId}/all`;
  const res = await fetch(url, { headers: plexHeaders() });

  if (!res.ok) {
    throw new Error(`Plex API error fetching section ${sectionId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items = data?.MediaContainer?.Metadata ?? [];

  return items.map((item: PlexLibraryItem) => ({
    ratingKey: item.ratingKey,
    rating: item.rating ?? null,
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
  const url = `${PLEX_URL()}/library/metadata/${ratingKey}`;
  const res = await fetch(url, { headers: plexHeaders() });

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
  // Plex returns duration in milliseconds; convert to minutes
  const durationMinutes = metadata.duration ? Math.round(metadata.duration / 60000) : null;

  return {
    plex_rating_key: metadata.ratingKey,
    type: mediaType,
    title: metadata.title,
    year: metadata.year ?? null,
    summary: metadata.summary ?? null,
    poster_url: posterUrl,
    rating: metadata.rating ?? null,
    genre: genres,
    duration: durationMinutes,
    content_rating: metadata.contentRating ?? null,
    episode_count: metadata.leafCount ?? null,
  };
}
