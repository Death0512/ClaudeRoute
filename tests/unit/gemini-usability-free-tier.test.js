import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clauderoute-gemini-test-"));
process.env.DATA_DIR = tempDir;

let FREE_PROVIDERS;
let FREE_TIER_PROVIDERS;
let getProviderCredentials;

describe("Free tier and Gemini usability", () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ FREE_PROVIDERS, FREE_TIER_PROVIDERS } = await import("../../src/shared/constants/providers.js"));
    ({ getProviderCredentials } = await import("../../src/sse/services/auth.js"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalGoogleKey !== undefined) {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  it("ensures FREE_PROVIDERS is empty and does not duplicate FREE_TIER_PROVIDERS", () => {
    expect(FREE_PROVIDERS).toEqual({});
    expect(FREE_TIER_PROVIDERS.nvidia).toBeDefined();
    expect(FREE_TIER_PROVIDERS.gemini).toBeUndefined();
    expect(Object.keys(FREE_TIER_PROVIDERS)).toEqual(["nvidia"]);
    expect(FREE_PROVIDERS.gemini).toBeUndefined();
    expect(FREE_PROVIDERS.nvidia).toBeUndefined();
  });

  it("falls back to GEMINI_API_KEY when no connection is found for gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const creds = await getProviderCredentials("gemini");
    expect(creds).toMatchObject({
      id: "env:GEMINI_API_KEY",
      connectionId: "env:GEMINI_API_KEY",
      apiKey: "test-gemini-key",
      authType: "apikey",
      isActive: true,
    });
  });

  it("falls back to GOOGLE_API_KEY when GEMINI_API_KEY is not set", async () => {
    process.env.GOOGLE_API_KEY = "test-google-key";
    const creds = await getProviderCredentials("gemini");
    expect(creds).toMatchObject({
      id: "env:GEMINI_API_KEY",
      connectionId: "env:GEMINI_API_KEY",
      apiKey: "test-google-key",
      authType: "apikey",
      isActive: true,
    });
  });

  it("respects excludeConnectionIds for env credentials", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const creds = await getProviderCredentials("gemini", new Set(["env:GEMINI_API_KEY"]));
    expect(creds).toBeNull();
  });

  it("probes Gemini connection via v1beta models endpoint in testSingleConnection", async () => {
    const { createProviderConnection, deleteProviderConnection } = await import("../../src/lib/localDb.js");
    const originalFetch = global.fetch;

    let probedUrl = null;
    global.fetch = async (url) => {
      probedUrl = url;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const conn = await createProviderConnection({
      provider: "gemini",
      authType: "apikey",
      apiKey: "AIza-dummy-key",
      name: "test-gemini",
    });

    try {
      const { testSingleConnection } = await import("../../src/app/api/providers/[id]/test/testUtils.js");
      const result = await testSingleConnection(conn.id);
      expect(result.valid).toBe(true);
      expect(probedUrl).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=AIza-dummy-key");
    } finally {
      global.fetch = originalFetch;
      await deleteProviderConnection(conn.id);
    }
  });
});
