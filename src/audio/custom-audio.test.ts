import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCustomAudioCachesForTests,
  buildPublicUrl,
  loadBuffer,
  loadManifest,
  resolveTrack
} from "./custom-audio";

type MockResponse = {
  ok: boolean;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

function makeJsonResponse(payload: unknown, ok = true): MockResponse {
  return {
    ok,
    json: async () => payload
  };
}

function makeArrayBufferResponse(ok = true): MockResponse {
  return {
    ok,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
  };
}

describe("custom-audio", () => {
  beforeEach(() => {
    __resetCustomAudioCachesForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves roles by exact match, then default, then first file", async () => {
    const manifest = {
      version: 1,
      files: [
        { file: "first.wav", roles: ["default"] },
        { file: "abx-a.wav", roles: ["abx:a"] },
        { file: "fallback.flac" }
      ]
    };
    const fetchMock = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(makeJsonResponse(manifest) as never);
    const loaded = await loadManifest("soundfield");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const explicit = resolveTrack("soundfield", loaded, ["abx:a", "abx:b"]);
    expect(explicit?.file).toBe("abx-a.wav");
    expect(explicit?.matchedRole).toBe("abx:a");

    const defaults = resolveTrack("soundfield", loaded, ["abx:b"]);
    expect(defaults?.file).toBe("first.wav");
    expect(defaults?.matchedRole).toBe("default");

    const first = resolveTrack("soundfield", { version: 1, files: [{ file: "x.wav" }] }, ["missing"]);
    expect(first?.file).toBe("x.wav");
    expect(first?.matchedRole).toBeNull();
  });

  it("filters unsupported extensions in manifest", async () => {
    const manifest = {
      version: 1,
      files: [
        { file: "tone.ogg", roles: ["default"] },
        { file: "voice.MP3", roles: ["default"] }
      ]
    };
    vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(makeJsonResponse(manifest) as never);
    const loaded = await loadManifest("spatial");
    expect(loaded?.files).toHaveLength(1);
    expect(loaded?.files[0]?.file).toBe("voice.MP3");
  });

  it("builds urls relative to BASE_URL", () => {
    const url = buildPublicUrl("audio/soundfield/test.wav");
    expect(url).toContain("audio/soundfield/test.wav");
    expect(url.startsWith("/")).toBe(true);
  });

  it("returns decode fallback reason when audio decode fails", async () => {
    const responses: MockResponse[] = [
      makeJsonResponse({
        version: 1,
        files: [{ file: "broken.wav", roles: ["default"] }]
      }),
      makeArrayBufferResponse(true)
    ];
    vi.spyOn(globalThis, "fetch" as never).mockImplementation(async () => responses.shift() as never);
    const fakeCtx = {
      decodeAudioData: vi.fn(async () => {
        throw new Error("decode failed");
      })
    } as unknown as AudioContext;

    const result = await loadBuffer(fakeCtx, "soundfield", ["default"]);
    expect(result.buffer).toBeNull();
    expect(result.fallbackReason).toBe("audio_fetch_or_decode_failed");
  });
});
