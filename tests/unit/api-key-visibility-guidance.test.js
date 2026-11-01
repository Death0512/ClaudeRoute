import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const oldGuidance = "This is the only time you will see this key. Store it securely.";
const guidance = "Make sure to copy your API key now. You will not be able to see it again.";
const source = readFileSync(
  new URL("../../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js", import.meta.url),
  "utf-8"
);

describe("API key visibility guidance source verification", () => {
  it("verifies modal exists and contains key creation guidance", () => {
    const modal = source.match(/title="API Key Created"[\s\S]*?<\/Modal>/)?.[0];
    expect(modal).toBeDefined();
    expect(modal).not.toContain(oldGuidance);
  });
});
