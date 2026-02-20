import type {
  AudioBufferLoadResult,
  AudioManifest,
  AudioManifestFileEntry,
  AudioResolveResult
} from "./custom-audio-types";

const ALLOWED_EXTENSIONS = [".mp3", ".flac", ".wav", ".alac"] as const;

const manifestCache = new Map<string, Promise<AudioManifest | null>>();
const fileBufferCache = new Map<string, Promise<ArrayBuffer | null>>();
const decodedBufferCache = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer | null>>>();

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) {
    return "/";
  }
  const withLeadingSlash = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function buildPublicUrl(relativePath: string): string {
  const cleanRelative = relativePath.replace(/^\/+/, "");
  const baseUrl = normalizeBaseUrl(import.meta.env.BASE_URL ?? "/");
  return `${baseUrl}${cleanRelative}`;
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function sanitizeEntry(entry: unknown): AudioManifestFileEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const maybe = entry as { file?: unknown; roles?: unknown };
  if (typeof maybe.file !== "string" || !hasAllowedExtension(maybe.file)) {
    return null;
  }
  const roles =
    Array.isArray(maybe.roles) && maybe.roles.every((role) => typeof role === "string")
      ? (maybe.roles as string[])
      : undefined;
  return {
    file: maybe.file,
    roles
  };
}

function sanitizeManifest(input: unknown): AudioManifest | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const manifest = input as { version?: unknown; files?: unknown; params?: unknown };
  const version = typeof manifest.version === "number" ? manifest.version : 1;
  if (!Array.isArray(manifest.files)) {
    return null;
  }
  const files = manifest.files.map(sanitizeEntry).filter((entry): entry is AudioManifestFileEntry => entry !== null);
  const params =
    manifest.params && typeof manifest.params === "object" && !Array.isArray(manifest.params)
      ? (manifest.params as Record<string, unknown>)
      : undefined;
  return {
    version,
    files,
    params
  };
}

export async function loadManifest(modulePath: string): Promise<AudioManifest | null> {
  const normalizedPath = modulePath.replace(/^\/+|\/+$/g, "");
  if (!manifestCache.has(normalizedPath)) {
    manifestCache.set(
      normalizedPath,
      (async () => {
        const manifestUrl = buildPublicUrl(`audio/${normalizedPath}/manifest.json`);
        try {
          const response = await fetch(manifestUrl, { cache: "no-store" });
          if (!response.ok) {
            return null;
          }
          const payload = (await response.json()) as unknown;
          return sanitizeManifest(payload);
        } catch {
          return null;
        }
      })()
    );
  }
  return manifestCache.get(normalizedPath) ?? null;
}

function roleMatch(entry: AudioManifestFileEntry, role: string): boolean {
  return Array.isArray(entry.roles) && entry.roles.includes(role);
}

export function resolveTrack(
  modulePath: string,
  manifest: AudioManifest | null,
  roles: string[]
): AudioResolveResult | null {
  if (!manifest || manifest.files.length === 0) {
    return null;
  }
  const normalizedPath = modulePath.replace(/^\/+|\/+$/g, "");
  let selected: AudioManifestFileEntry | null = null;
  let matchedRole: string | null = null;

  for (const role of roles) {
    const exact = manifest.files.find((entry) => roleMatch(entry, role));
    if (exact) {
      selected = exact;
      matchedRole = role;
      break;
    }
  }

  if (!selected) {
    const defaultEntry = manifest.files.find((entry) => roleMatch(entry, "default"));
    if (defaultEntry) {
      selected = defaultEntry;
      matchedRole = "default";
    }
  }

  if (!selected) {
    selected = manifest.files[0] ?? null;
    matchedRole = null;
  }

  if (!selected) {
    return null;
  }

  const file = selected.file.replace(/^\/+/, "");
  return {
    modulePath: normalizedPath,
    file,
    url: buildPublicUrl(`audio/${normalizedPath}/${file}`),
    matchedRole
  };
}

export function getManifestNumberParam(manifest: AudioManifest | null, key: string, fallback: number): number {
  const value = manifest?.params?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getManifestStringParam(manifest: AudioManifest | null, key: string, fallback: string): string {
  const value = manifest?.params?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

async function fetchFileBuffer(url: string): Promise<ArrayBuffer | null> {
  if (!fileBufferCache.has(url)) {
    fileBufferCache.set(
      url,
      (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            return null;
          }
          return await response.arrayBuffer();
        } catch {
          return null;
        }
      })()
    );
  }
  return fileBufferCache.get(url) ?? null;
}

async function decodeFileBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (!decodedBufferCache.has(ctx)) {
    decodedBufferCache.set(ctx, new Map<string, Promise<AudioBuffer | null>>());
  }
  const cache = decodedBufferCache.get(ctx)!;
  if (!cache.has(url)) {
    cache.set(
      url,
      (async () => {
        const raw = await fetchFileBuffer(url);
        if (!raw) {
          return null;
        }
        try {
          return await ctx.decodeAudioData(raw.slice(0));
        } catch {
          return null;
        }
      })()
    );
  }
  return cache.get(url) ?? null;
}

export async function loadBuffer(
  ctx: AudioContext,
  modulePath: string,
  roles: string[]
): Promise<AudioBufferLoadResult> {
  const manifest = await loadManifest(modulePath);
  const resolved = resolveTrack(modulePath, manifest, roles);
  if (!resolved) {
    return {
      buffer: null,
      source: null,
      fallbackReason: "manifest_missing_or_no_audio_files",
      manifest
    };
  }

  const decoded = await decodeFileBuffer(ctx, resolved.url);
  if (!decoded) {
    return {
      buffer: null,
      source: resolved,
      fallbackReason: "audio_fetch_or_decode_failed",
      manifest
    };
  }

  return {
    buffer: decoded,
    source: resolved,
    fallbackReason: null,
    manifest
  };
}

export function __resetCustomAudioCachesForTests(): void {
  manifestCache.clear();
  fileBufferCache.clear();
}
