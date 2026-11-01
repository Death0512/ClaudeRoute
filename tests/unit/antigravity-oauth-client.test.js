import { describe, it, expect } from "vitest";

const decodeHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const EXPECTED = {
  clientId: decodeHex("313037313030363036303539312d746d687373696e326832316c63726532333576746f6c6f6a68346734303365702e617070732e676f6f676c6575736572636f6e74656e742e636f6d"),
  clientSecret: decodeHex("474f435350582d4b35384657523438364c644c4a316d4c4238735843347a3671444166"),
};
const GOOGLE = {
  clientId: decodeHex("3638313235353830393339352d6f6f386674326f707264726e7039653361716636617633686d6469623133356a2e617070732e676f6f676c6575736572636f6e74656e742e636f6d"),
  clientSecret: decodeHex("474f435350582d347548674d506d2d316f37536b2d67655636437535636c584673786c"),
};

describe("antigravity oauth client (deduped)", () => {
  it("shared source holds the canonical credentials", async () => {
    const { ANTIGRAVITY_OAUTH_CLIENT } = await import("../../open-sse/providers/shared.js");
    expect(ANTIGRAVITY_OAUTH_CLIENT).toEqual(EXPECTED);
  });

  it("registry transport keeps clientId/clientSecret", async () => {
    const ag = (await import("../../open-sse/providers/registry/antigravity.js")).default;
    expect(ag.transport.clientId).toBe(EXPECTED.clientId);
    expect(ag.transport.clientSecret).toBe(EXPECTED.clientSecret);
  });

  it("google client shared by gemini + gemini-cli", async () => {
    const { GOOGLE_OAUTH_CLIENT } = await import("../../open-sse/providers/shared.js");
    expect(GOOGLE_OAUTH_CLIENT).toEqual(GOOGLE);
    const gemini = (await import("../../open-sse/providers/registry/gemini.js")).default;
    const gc = (await import("../../open-sse/providers/registry/gemini-cli.js")).default;
    expect(gemini.transport.clientSecret).toBe(GOOGLE.clientSecret);
    expect(gc.transport.clientSecret).toBe(GOOGLE.clientSecret);
  });

  it("src oauth.js imports shared client + keeps full shape", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../src/lib/oauth/constants/oauth.js"), "utf8");
    expect(src).toContain('import { ANTIGRAVITY_OAUTH_CLIENT, GOOGLE_OAUTH_CLIENT } from "open-sse/providers/shared.js"');
    expect(src).toContain("...ANTIGRAVITY_OAUTH_CLIENT");
    expect(src).toContain("...GOOGLE_OAUTH_CLIENT");
    expect(src).toContain('PROVIDER_OAUTH["antigravity"]');
    expect(src).toContain('PROVIDER_OAUTH["gemini-cli"]');
    expect(src).not.toContain(EXPECTED.clientSecret);
    expect(src).not.toContain(GOOGLE.clientSecret);
  });

  it("respects process.env overrides independently and falls back when unset", async () => {
    const { execSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const staticScript = `const {ANTIGRAVITY_OAUTH_CLIENT,GOOGLE_OAUTH_CLIENT}=await import("./open-sse/providers/shared.js");console.log(JSON.stringify({agId:ANTIGRAVITY_OAUTH_CLIENT.clientId,agSecret:ANTIGRAVITY_OAUTH_CLIENT.clientSecret,gId:GOOGLE_OAUTH_CLIENT.clientId,gSecret:GOOGLE_OAUTH_CLIENT.clientSecret}));`;
    const runCase = (envOverrides = {}) => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.ANTIGRAVITY_CLIENT_ID;
      delete cleanEnv.ANTIGRAVITY_CLIENT_SECRET;
      delete cleanEnv.GOOGLE_CLIENT_ID;
      delete cleanEnv.GOOGLE_CLIENT_SECRET;
      const out = execSync(`node --input-type=module -e '${staticScript}'`, {
        encoding: "utf8",
        cwd: rootDir,
        env: { ...cleanEnv, ...envOverrides }
      });
      return JSON.parse(out.trim());
    };

    const baseline = runCase();
    expect(baseline.agId).toBe(EXPECTED.clientId);
    expect(baseline.agSecret).toBe(EXPECTED.clientSecret);
    expect(baseline.gId).toBe(GOOGLE.clientId);
    expect(baseline.gSecret).toBe(GOOGLE.clientSecret);

    const agIdOnly = runCase({ ANTIGRAVITY_CLIENT_ID: "override-ag-id" });
    expect(agIdOnly.agId).toBe("override-ag-id");
    expect(agIdOnly.agSecret).toBe(EXPECTED.clientSecret);

    const agSecretOnly = runCase({ ANTIGRAVITY_CLIENT_SECRET: "override-ag-secret" });
    expect(agSecretOnly.agSecret).toBe("override-ag-secret");
    expect(agSecretOnly.agId).toBe(EXPECTED.clientId);

    const gIdOnly = runCase({ GOOGLE_CLIENT_ID: "override-g-id" });
    expect(gIdOnly.gId).toBe("override-g-id");
    expect(gIdOnly.gSecret).toBe(GOOGLE.clientSecret);

    const gSecretOnly = runCase({ GOOGLE_CLIENT_SECRET: "override-g-secret" });
    expect(gSecretOnly.gSecret).toBe("override-g-secret");
    expect(gSecretOnly.gId).toBe(GOOGLE.clientId);
  });
});
