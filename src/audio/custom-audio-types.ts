export type AudioManifestFileEntry = {
  file: string;
  roles?: string[];
};

export type AudioManifest = {
  version: number;
  files: AudioManifestFileEntry[];
  params?: Record<string, unknown>;
};

export type AudioResolveResult = {
  modulePath: string;
  file: string;
  url: string;
  matchedRole: string | null;
};

export type AudioBufferLoadResult = {
  buffer: AudioBuffer | null;
  source: AudioResolveResult | null;
  fallbackReason: string | null;
  manifest: AudioManifest | null;
};
