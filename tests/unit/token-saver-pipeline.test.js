import { describe, it, expect, vi, beforeEach } from "vitest";
import { compressMessages } from "../../open-sse/rtk/index.js";
import { getCombinedPrompt, injectCombinedPrompt } from "../../open-sse/rtk/combinedPrompt.js";
import { runTokenSaverPipeline } from "../../open-sse/rtk/pipeline.js";
import { CLAUDE_BLOCK } from "../../open-sse/translator/schema/blocks.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

function makeLongDiff(count = 200) {
  const lines = [
    "diff --git a/foo.js b/foo.js",
    "index abc..def 100644",
    "--- a/foo.js",
    "+++ b/foo.js",
    "@@ -1,3 +1,200 @@",
  ];
  for (let i = 0; i < count; i++) {
    lines.push(`+added line ${i} ${"x".repeat(30)}`);
  }
  return lines.join("\n");
}

describe("token saver pipeline - cache boundary protection", () => {
  it("preserves blocks with cache_control byte-for-byte and compresses uncached blocks", () => {
    const diffText = makeLongDiff(150);
    const body = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "cached_1",
              content: diffText,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "tool_result",
              tool_use_id: "uncached_2",
              content: diffText,
            },
          ],
        },
      ],
    };

    const stats = compressMessages(body, true);
    expect(stats).not.toBeNull();
    expect(body.messages[0].content[0].content).toBe(diffText);
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[0].content[1].content.length).toBeLessThan(diffText.length);
  });

  it("preserves message when msg.cache_control is set", () => {
    const diffText = makeLongDiff(100);
    const body = {
      messages: [
        {
          role: "user",
          cache_control: { type: "ephemeral" },
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: diffText,
            },
          ],
        },
      ],
    };

    compressMessages(body, true);
    expect(body.messages[0].content[0].content).toBe(diffText);
  });
});

describe("token saver pipeline - combined prompt injection", () => {
  it("combines caveman and ponytail without duplicating persistence or persona", () => {
    const prompt = getCombinedPrompt("ultra", "full");
    expect(prompt).toContain("You are a lazy senior developer");
    expect(prompt).toContain("Respond ultra-terse");
    expect(prompt).toContain("ACTIVE EVERY RESPONSE");

    const matches = prompt.match(/ACTIVE EVERY RESPONSE/g) || [];
    expect(matches.length).toBe(1);
    expect(prompt).toContain("No filler drift or over-building");
  });

  it("splices combined prompt before the final cache_control block in claude system array", () => {
    const body = {
      system: [
        { type: CLAUDE_BLOCK.TEXT, text: "base instruction" },
        { type: CLAUDE_BLOCK.TEXT, text: "cached anchor", cache_control: { type: "ephemeral" } },
      ],
    };

    injectCombinedPrompt(body, FORMATS.CLAUDE, "ultra", "full");

    expect(body.system.length).toBe(3);
    expect(body.system[0].text).toBe("base instruction");
    expect(body.system[1].text).toBe(getCombinedPrompt("ultra", "full"));
    expect(body.system[2].text).toBe("cached anchor");
    expect(body.system[2].cache_control).toEqual({ type: "ephemeral" });
  });

  it("is idempotent when injectCombinedPrompt is called multiple times", () => {
    const body = {
      system: [
        { type: CLAUDE_BLOCK.TEXT, text: "cached anchor", cache_control: { type: "ephemeral" } },
      ],
    };

    injectCombinedPrompt(body, FORMATS.CLAUDE, "ultra", "full");
    expect(body.system.length).toBe(2);

    injectCombinedPrompt(body, FORMATS.CLAUDE, "ultra", "full");
    expect(body.system.length).toBe(2);
  });
});

describe("token saver pipeline - cascade bail-out", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips headroom when RTK achieves >= 15% reduction", async () => {
    const diffText = makeLongDiff(300);
    const body = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "diff_tool",
              content: diffText,
            },
          ],
        },
      ],
    };

    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.CLAUDE,
      upstreamModel: "claude-sonnet-4-5",
      tokenSaverEnabled: true,
      rtkEnabled: true,
      headroomEnabled: true,
      headroomUrl: "http://localhost:8787",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.headroomStats).toBeNull();
    expect(result.headroomDiagnostics.reason).toBe("skipped: rtk reduction >= 15%");
    expect(result.tokenSaverStats.rtk.savedBytes).toBeGreaterThan(0);
  });

  it("skips headroom when body size is under 32KB", async () => {
    const smallText = "short text " + "a".repeat(500);
    const body = {
      messages: [{ role: "user", content: smallText }],
    };

    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.OPENAI,
      upstreamModel: "gpt-4o",
      tokenSaverEnabled: true,
      rtkEnabled: true,
      headroomEnabled: true,
      headroomUrl: "http://localhost:8787",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.headroomStats).toBeNull();
    expect(result.headroomDiagnostics.reason).toBe("skipped: body under 32KB");
  });

  it("calls headroom when body remains large and RTK reduction is under 15%", async () => {
    const largeNoise = "plain prose without any tool results ".repeat(1500);
    const body = {
      messages: [{ role: "user", content: largeNoise }],
    };

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        messages: [{ role: "user", content: "compressed prose" }],
        tokens_before: 2000,
        tokens_after: 500,
        tokens_saved: 1500,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.OPENAI,
      upstreamModel: "gpt-4o",
      tokenSaverEnabled: true,
      rtkEnabled: true,
      headroomEnabled: true,
      headroomUrl: "http://localhost:8787",
    });

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(result.headroomStats).not.toBeNull();
    expect(result.tokenSaverStats.headroom.savedBytes).toBeGreaterThan(0);
  });
});

describe("token saver pipeline - ledger telemetry accumulation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates telemetry for rtk, headroom, and combined outputStyle", async () => {
    const largeNoise = "word ".repeat(10000);
    const body = {
      messages: [{ role: "user", content: largeNoise }],
    };

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        messages: [{ role: "user", content: "shorter text" }],
        tokens_before: 1000,
        tokens_after: 200,
        tokens_saved: 800,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.OPENAI,
      upstreamModel: "gpt-4o",
      tokenSaverEnabled: true,
      rtkEnabled: true,
      headroomEnabled: true,
      headroomUrl: "http://localhost:8787",
      cavemanEnabled: true,
      cavemanLevel: "ultra",
      ponytailEnabled: true,
      ponytailLevel: "full",
    });

    expect(result.tokenSaverStats).toMatchObject({
      rtk: { savedBytes: 0 },
      headroom: { savedBytes: expect.any(Number) },
      outputStyle: { active: ["caveman", "ponytail"] },
    });
    expect(result.tokenSaverStats.headroom.savedBytes).toBeGreaterThan(0);
  });

  it("tracks single output style when only caveman is enabled", async () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.OPENAI,
      tokenSaverEnabled: true,
      cavemanEnabled: true,
      cavemanLevel: "lite",
      ponytailEnabled: false,
    });

    expect(result.tokenSaverStats.outputStyle.active).toEqual(["caveman"]);
  });

  it("tracks single output style when only ponytail is enabled", async () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    const result = await runTokenSaverPipeline({
      body,
      finalFormat: FORMATS.OPENAI,
      tokenSaverEnabled: true,
      cavemanEnabled: false,
      ponytailEnabled: true,
      ponytailLevel: "lite",
    });

    expect(result.tokenSaverStats.outputStyle.active).toEqual(["ponytail"]);
  });
});
