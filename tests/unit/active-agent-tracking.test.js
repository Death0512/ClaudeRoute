import { describe, it, expect, beforeEach } from "vitest";
import { trackPendingRequest, getActiveRequests } from "@/lib/db/repos/usageRepo.js";

describe("active agent tracking", () => {
  beforeEach(() => {
    if (global._pendingRequestsMap) {
      global._pendingRequestsMap.clear();
    }
    if (global._pendingRequests) {
      global._pendingRequests.byModel = {};
      global._pendingRequests.byAccount = {};
    }
  });

  it("stores and retrieves agent and account metadata in getActiveRequests", async () => {
    const meta = {
      reqId: "req-test-1",
      agent: "coder",
      account: "my-account-1",
    };

    trackPendingRequest("claude-3-7-sonnet", "anthropic", "conn-123", true, false, meta);

    const { activeRequests } = await getActiveRequests();
    expect(activeRequests).toHaveLength(1);

    const entry = activeRequests[0];
    expect(entry.id).toBe("req-test-1");
    expect(entry.model).toBe("claude-3-7-sonnet");
    expect(entry.provider).toBe("anthropic");
    expect(entry.connectionId).toBe("conn-123");
    expect(entry.agent).toBe("coder");
    expect(entry.account).toBe("my-account-1");
    expect(entry.count).toBe(1);
    expect(typeof entry.startedAt).toBe("number");
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("removes active request on completion with reqId", async () => {
    trackPendingRequest("claude-3-7-sonnet", "anthropic", "conn-123", true, false, {
      reqId: "req-test-2",
      agent: "planner",
      account: "acc-2",
    });

    let res = await getActiveRequests();
    expect(res.activeRequests.some((r) => r.id === "req-test-2")).toBe(true);

    trackPendingRequest("claude-3-7-sonnet", "anthropic", "conn-123", false, false, {
      reqId: "req-test-2",
    });

    res = await getActiveRequests();
    expect(res.activeRequests.some((r) => r.id === "req-test-2")).toBe(false);
  });

  it("removes active request on completion without reqId by connectionId and model fallback", async () => {
    trackPendingRequest("gpt-4o", "openai", "conn-456", true, false, {
      agent: "reviewer",
      account: "acc-openai",
    });

    let res = await getActiveRequests();
    expect(res.activeRequests).toHaveLength(1);
    expect(res.activeRequests[0].agent).toBe("reviewer");

    trackPendingRequest("gpt-4o", "openai", "conn-456", false);

    res = await getActiveRequests();
    expect(res.activeRequests).toHaveLength(0);
  });

  it("defaults agent to Agent when omitted", async () => {
    trackPendingRequest("deepseek-chat", "deepseek", "conn-789", true, false, {
      reqId: "req-test-3",
    });

    const { activeRequests } = await getActiveRequests();
    expect(activeRequests).toHaveLength(1);
    expect(activeRequests[0].agent).toBe("Agent");

    trackPendingRequest("deepseek-chat", "deepseek", "conn-789", false, false, {
      reqId: "req-test-3",
    });
  });

  it("cleans up expired active requests older than 60s", async () => {
    const originalNow = Date.now;
    let fakeNow = 1000000;
    Date.now = () => fakeNow;

    try {
      trackPendingRequest("claude-3-7-sonnet", "anthropic", "conn-999", true, false, {
        reqId: "req-test-timeout",
        agent: "oracle",
        account: "acc-timeout",
      });

      let res = await getActiveRequests();
      expect(res.activeRequests.some((r) => r.id === "req-test-timeout")).toBe(true);

      fakeNow += 65000;

      res = await getActiveRequests();
      expect(res.activeRequests.some((r) => r.id === "req-test-timeout")).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });
});
