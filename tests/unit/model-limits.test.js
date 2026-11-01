import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveModelLimit, applyModelLimit } from "../../src/shared/utils/modelLimits.js";

const mocks = vi.hoisted(() => ({
  json: vi.fn((body, init) => ({
    status: init?.status || 200,
    body,
  })),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: mocks.json },
}));

vi.mock("@/lib/db/repos/settingsRepo.js", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}));

const { GET, PUT } = await import("../../src/app/api/settings/model-limits/route.js");

describe("resolveModelLimit precedence", () => {
  it("resolves exact provider/model match first", () => {
    const limits = {
      "openai/gpt-4o": { contextWindow: 1000 },
      "oai/gpt-4o": { contextWindow: 2000 },
      "openai/*": { contextWindow: 3000 },
      "oai/*": { contextWindow: 4000 },
      "gpt-4o": { contextWindow: 5000 },
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 1000 });
  });

  it("resolves alias/model match second", () => {
    const limits = {
      "oai/gpt-4o": { contextWindow: 2000 },
      "openai/*": { contextWindow: 3000 },
      "oai/*": { contextWindow: 4000 },
      "gpt-4o": { contextWindow: 5000 },
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 2000 });
  });

  it("resolves provider wildcard third", () => {
    const limits = {
      "openai/*": { contextWindow: 3000 },
      "oai/*": { contextWindow: 4000 },
      "gpt-4o": { contextWindow: 5000 },
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 3000 });
  });

  it("resolves alias wildcard fourth", () => {
    const limits = {
      "oai/*": { contextWindow: 4000 },
      "gpt-4o": { contextWindow: 5000 },
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 4000 });
  });

  it("resolves model match fifth", () => {
    const limits = {
      "gpt-4o": { contextWindow: 5000 },
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 5000 });
  });

  it("resolves global wildcard sixth", () => {
    const limits = {
      "*": { contextWindow: 6000 },
    };
    expect(resolveModelLimit(limits, "openai", "gpt-4o", "oai")).toEqual({ contextWindow: 6000 });
  });

  it("returns null when no pattern matches or limits empty", () => {
    expect(resolveModelLimit({}, "openai", "gpt-4o", "oai")).toBeNull();
    expect(resolveModelLimit(null, "openai", "gpt-4o")).toBeNull();
  });
});

describe("applyModelLimit", () => {
  it("correctly updates context_length and compactWindow when compactWindow is specified", () => {
    const model = {
      id: "openai/gpt-4o",
      capabilities: { contextWindow: 128000, maxOutput: 4096 },
    };
    const limitOverride = {
      compactWindow: 64000,
      contextWindow: 100000,
      maxOutput: 8192,
    };
    const result = applyModelLimit(model, limitOverride);

    expect(result.context_length).toBe(64000);
    expect(result.capabilities.compactWindow).toBe(64000);
    expect(result.capabilities.contextWindow).toBe(100000);
    expect(result.max_completion_tokens).toBe(8192);
    expect(result.capabilities.maxOutput).toBe(8192);
  });

  it("correctly updates context_length and contextWindow when compactWindow is absent", () => {
    const model = {
      id: "anthropic/claude-3-5-sonnet",
      capabilities: { contextWindow: 200000, maxOutput: 8192 },
    };
    const limitOverride = {
      contextWindow: 150000,
      maxOutput: 4096,
    };
    const result = applyModelLimit(model, limitOverride);

    expect(result.context_length).toBe(150000);
    expect(result.capabilities.contextWindow).toBe(150000);
    expect(result.max_completion_tokens).toBe(4096);
    expect(result.capabilities.maxOutput).toBe(4096);
  });

  it("handles model without capabilities without crashing", () => {
    const model = { id: "test/model" };
    const limitOverride = {
      compactWindow: 32000,
      maxOutput: 2048,
    };
    const result = applyModelLimit(model, limitOverride);

    expect(result.context_length).toBe(32000);
    expect(result.max_completion_tokens).toBe(2048);
  });

  it("returns unmodified model if limitOverride is missing", () => {
    const model = { id: "test/model", context_length: 1000 };
    expect(applyModelLimit(model, null)).toBe(model);
  });
});

describe("model-limits API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns current modelLimits from settings", async () => {
    mocks.getSettings.mockResolvedValue({
      modelLimits: { "openai/*": { contextWindow: 64000 } },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      modelLimits: { "openai/*": { contextWindow: 64000 } },
    });
  });

  it("PUT persists valid modelLimits and returns updated limits", async () => {
    const validLimits = {
      "openai/gpt-4o": { contextWindow: 128000, compactWindow: 64000, maxOutput: 4096 },
      "anthropic/*": { compactWindow: 100000 },
    };
    mocks.updateSettings.mockResolvedValue({
      modelLimits: validLimits,
    });

    const req = {
      json: async () => ({ modelLimits: validLimits }),
    };

    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(mocks.updateSettings).toHaveBeenCalledWith({ modelLimits: validLimits });
    expect(res.body).toEqual({ modelLimits: validLimits });
  });

  it("PUT rejects non-object or malformed modelLimits with 400", async () => {
    const invalidInputs = [
      { modelLimits: null },
      { modelLimits: "invalid" },
      { modelLimits: { "openai/*": "not-an-object" } },
      { modelLimits: { "openai/*": { contextWindow: -500 } } },
      { modelLimits: { "openai/*": { contextWindow: "not-a-number" } } },
      { modelLimits: { "openai/*": { invalidField: 1000 } } },
    ];

    for (const body of invalidInputs) {
      const req = { json: async () => body };
      const res = await PUT(req);
      expect(res.status).toBe(400);
    }
  });
});
