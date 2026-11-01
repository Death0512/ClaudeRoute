import { describe, it, expect, beforeEach, vi } from "vitest";
import { rendezvousScore, scoreAccounts } from "../../open-sse/services/accountAffinity.js";
import { resolveSessionIdentity } from "../../open-sse/utils/sessionManager.js";
import {
  getOAuthSessionAvailability,
  getForeignOAuthSessionCount,
  reserveOAuthSession,
  wrapResponseWithOAuthSessionRelease,
  _clearForTest
} from "../../open-sse/services/oauthSessionOccupancy.js";

const localDbMocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  updateProviderConnection: vi.fn()
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: localDbMocks.getProviderConnections,
  getSettings: localDbMocks.getSettings,
  updateProviderConnection: localDbMocks.updateProviderConnection,
  getProxyPools: vi.fn().mockResolvedValue([]),
  validateApiKey: vi.fn().mockResolvedValue(true)
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn().mockResolvedValue({}),
  pickProxyPoolId: vi.fn()
}));

const { getProviderCredentials } = await import("../../src/sse/services/auth.js");

beforeEach(() => {
  _clearForTest();
  vi.clearAllMocks();
});

describe("Account Affinity & Lease Occupancy", () => {
  it("maintains HRW determinism across repeated calls", () => {
    const connections = [
      { id: "conn-alpha" },
      { id: "conn-beta" },
      { id: "conn-gamma" },
      { id: "conn-delta" }
    ];
    const sessionKey = "session-test-determinism-123";

    const score1 = rendezvousScore(sessionKey, "conn-alpha");
    const score2 = rendezvousScore(sessionKey, "conn-alpha");
    expect(score1).toBe(score2);
    expect(score1).toBeGreaterThanOrEqual(0);
    expect(score1).toBeLessThan(1);

    const initialRanking = scoreAccounts(sessionKey, connections);
    const expectedTop = initialRanking[0].id;

    for (let i = 0; i < 50; i++) {
      const ranking = scoreAccounts(sessionKey, connections);
      expect(ranking[0].id).toBe(expectedTop);
      expect(ranking.map((c) => c.id)).toEqual(initialRanking.map((c) => c.id));
    }
  });

  it("yields 100% stable account selection across multiple calls regardless of concurrency", () => {
    const connections = [
      { id: "conn-alpha" },
      { id: "conn-beta" },
      { id: "conn-gamma" },
      { id: "conn-delta" }
    ];
    const sessionKey = "session-test-determinism-123";
    const initialPick = scoreAccounts(sessionKey, connections)[0].id;

    const releases = [];
    for (let i = 1; i <= 20; i++) {
      releases.push(reserveOAuthSession(initialPick, `foreign-session-${i}`));
    }

    expect(getForeignOAuthSessionCount(initialPick, sessionKey)).toBe(20);
    expect(getOAuthSessionAvailability(initialPick, sessionKey)).toBeLessThan(0.1);

    for (let i = 0; i < 100; i++) {
      const ranking = scoreAccounts(sessionKey, connections);
      expect(ranking[0].id).toBe(initialPick);
    }

    for (const release of releases) {
      release();
    }
  });

  it("resolves subagents deterministically and distributes across accounts", () => {
    const parentSession = "claude:sess1";
    const coderKey = `${parentSession}#agent=coder`;
    const testerKey = `${parentSession}#agent=tester`;
    const reviewerKey = `${parentSession}#agent=reviewer`;

    const fromCoderHeader = resolveSessionIdentity({
      headers: { "x-agent-id": "coder" },
      body: { prompt_cache_key: parentSession }
    }).sessionId;
    const fromTesterHeader = resolveSessionIdentity({
      headers: { "x-subagent-type": "tester" },
      body: { prompt_cache_key: parentSession }
    }).sessionId;
    const fromReviewerHeader = resolveSessionIdentity({
      headers: { "x-agent-name": "reviewer" },
      body: { prompt_cache_key: parentSession }
    }).sessionId;

    expect(fromCoderHeader).toBe(coderKey);
    expect(fromTesterHeader).toBe(testerKey);
    expect(fromReviewerHeader).toBe(reviewerKey);

    const connections = [
      { id: "conn-1" },
      { id: "conn-2" },
      { id: "conn-3" },
      { id: "conn-4" }
    ];

    const coderAccount = scoreAccounts(coderKey, connections)[0].id;
    const testerAccount = scoreAccounts(testerKey, connections)[0].id;
    const reviewerAccount = scoreAccounts(reviewerKey, connections)[0].id;

    for (let i = 0; i < 50; i++) {
      expect(scoreAccounts(coderKey, connections)[0].id).toBe(coderAccount);
      expect(scoreAccounts(testerKey, connections)[0].id).toBe(testerAccount);
      expect(scoreAccounts(reviewerKey, connections)[0].id).toBe(reviewerAccount);
    }

    const uniqueAccounts = new Set([coderAccount, testerAccount, reviewerAccount]);
    expect(uniqueAccounts.size).toBeGreaterThan(1);
  });

  it("enforces unambiguous subagent delimiter (#agent=...) and bounds length safely", () => {
    const parentSession = "claude:session-with:colons:and/slashes";
    const rawSubagent = "subagent/with:special@chars!";
    const expectedSubagent = "subagent_with_special_chars_";
    const expectedSession = `${parentSession}#agent=${expectedSubagent}`;

    const resolved = resolveSessionIdentity({
      headers: { "x-agent-id": rawSubagent },
      body: { prompt_cache_key: parentSession }
    }).sessionId;

    expect(resolved).toBe(expectedSession);
    expect(resolved.includes("#agent=")).toBe(true);

    const reResolved = resolveSessionIdentity({
      headers: { "x-agent-id": rawSubagent },
      body: { prompt_cache_key: expectedSession }
    }).sessionId;
    expect(reResolved).toBe(expectedSession);

    const replaced = resolveSessionIdentity({
      headers: { "x-agent-id": "two" },
      body: { prompt_cache_key: "base#agent=one" }
    }).sessionId;
    expect(replaced).toBe("base#agent=two");
    expect(replaced).not.toBe("base#agent=one#agent=two");

    const appended = resolveSessionIdentity({
      headers: { "x-agent-id": "coder" },
      body: { prompt_cache_key: expectedSession }
    }).sessionId;
    expect(appended).toBe(`${parentSession}#agent=coder`);

    const longSubagent = "a".repeat(100);
    const resolvedLongAgent = resolveSessionIdentity({
      headers: { "x-agent-id": longSubagent },
      body: { prompt_cache_key: "parent" }
    }).sessionId;
    expect(resolvedLongAgent).toBe(`parent#agent=${"a".repeat(64)}`);

    const hugeParent = "x".repeat(300);
    const boundedSession = resolveSessionIdentity({
      headers: { "x-agent-id": "bounded-agent" },
      body: { prompt_cache_key: hugeParent }
    }).sessionId;
    expect(boundedSession.length).toBeLessThanOrEqual(256);
    expect(boundedSession.endsWith("#agent=bounded-agent")).toBe(true);

    const maxBaseSession = "s".repeat(256);
    const boundedMaxSession = resolveSessionIdentity({
      headers: { "x-agent-id": "agent-sub" },
      body: { prompt_cache_key: maxBaseSession }
    }).sessionId;
    expect(boundedMaxSession.length).toBeLessThanOrEqual(256);
    expect(boundedMaxSession.length).toBe(256);
    expect(boundedMaxSession.endsWith("#agent=agent-sub")).toBe(true);

    const fromRawReq = resolveSessionIdentity({
      rawRequest: {
        headers: { "x-agent-id": "tester" },
        body: { prompt_cache_key: "parent-raw" }
      }
    }).sessionId;
    expect(fromRawReq).toBe("parent-raw#agent=tester");
  });

  it("never collides distinct base sessions with identical agent tag and maps deterministically", () => {
    const sessionA = resolveSessionIdentity({
      headers: { "x-agent-id": "1" },
      body: { prompt_cache_key: "sess_a" }
    }).sessionId;
    const sessionB = resolveSessionIdentity({
      headers: { "x-agent-id": "1" },
      body: { prompt_cache_key: "sess_b" }
    }).sessionId;

    expect(sessionA).toBe("sess_a#agent=1");
    expect(sessionB).toBe("sess_b#agent=1");
    expect(sessionA).not.toBe(sessionB);

    const reSessionA = resolveSessionIdentity({
      headers: { "x-agent-id": "1" },
      body: { prompt_cache_key: "sess_a#agent=1" }
    }).sessionId;
    const reSessionB = resolveSessionIdentity({
      headers: { "x-agent-id": "1" },
      body: { prompt_cache_key: "sess_b#agent=1" }
    }).sessionId;

    expect(reSessionA).toBe("sess_a#agent=1");
    expect(reSessionB).toBe("sess_b#agent=1");
    expect(reSessionA).not.toBe(reSessionB);

    const connections = [
      { id: "conn-1" },
      { id: "conn-2" },
      { id: "conn-3" },
      { id: "conn-4" }
    ];

    const pickA1 = scoreAccounts(reSessionA, connections)[0].id;
    const pickA2 = scoreAccounts(reSessionA, connections)[0].id;
    const pickB1 = scoreAccounts(reSessionB, connections)[0].id;
    const pickB2 = scoreAccounts(reSessionB, connections)[0].id;

    expect(pickA1).toBe(pickA2);
    expect(pickB1).toBe(pickB2);

    const sanitizedWithBase = resolveSessionIdentity({
      headers: { "x-agent-id": "agent/sub:1" },
      body: { prompt_cache_key: "sess_base" }
    }).sessionId;
    expect(sanitizedWithBase).toBe("sess_base#agent=agent_sub_1");

    const sanitizedHeaderOnly = resolveSessionIdentity({
      headers: { "x-agent-id": "agent/sub:1" }
    }).sessionId;
    expect(sanitizedHeaderOnly.endsWith("#agent=agent_sub_1")).toBe(true);
  });

  it("switches account only when explicitly excluded via excludeConnectionIds", () => {
    const connections = [
      { id: "conn-alpha" },
      { id: "conn-beta" },
      { id: "conn-gamma" }
    ];
    const sessionKey = "claude:session-failover-test";
    const primary = scoreAccounts(sessionKey, connections)[0].id;

    for (let i = 0; i < 20; i++) {
      expect(scoreAccounts(sessionKey, connections)[0].id).toBe(primary);
    }

    const excludeConnectionIds = new Set([primary]);
    const remaining = connections.filter((c) => !excludeConnectionIds.has(c.id));
    const fallback = scoreAccounts(sessionKey, remaining)[0].id;

    expect(fallback).not.toBe(primary);
    expect(connections.map((c) => c.id)).toContain(fallback);

    for (let i = 0; i < 20; i++) {
      expect(scoreAccounts(sessionKey, remaining)[0].id).toBe(fallback);
    }

    expect(scoreAccounts(sessionKey, connections)[0].id).toBe(primary);
  });

  it("uses affinity and avoids round-robin rotation when sessionId is provided in getProviderCredentials", async () => {
    const conns = [
      { id: "conn-1", isActive: true, consecutiveUseCount: 0, lastUsedAt: new Date(1000).toISOString() },
      { id: "conn-2", isActive: true, consecutiveUseCount: 0, lastUsedAt: new Date(2000).toISOString() }
    ];
    localDbMocks.getProviderConnections.mockResolvedValue(conns);
    localDbMocks.getSettings.mockResolvedValue({ fallbackStrategy: "round-robin", stickyRoundRobinLimit: 1 });

    const creds1 = await getProviderCredentials("anthropic", null, "claude-3-7-sonnet", { sessionId: "sess-stable" });
    const creds2 = await getProviderCredentials("anthropic", null, "claude-3-7-sonnet", { sessionId: "sess-stable" });
    const creds3 = await getProviderCredentials("anthropic", null, "claude-3-7-sonnet", { sessionId: "sess-stable" });

    expect(creds1.connectionId).toBe(creds2.connectionId);
    expect(creds2.connectionId).toBe(creds3.connectionId);
    expect(localDbMocks.updateProviderConnection).not.toHaveBeenCalled();
  });

  it("fails over to secondary connection when primaryId is excluded via excludeConnectionIds in getProviderCredentials", async () => {
    const conns = [
      { id: "conn-primary", isActive: true, consecutiveUseCount: 0, lastUsedAt: new Date(1000).toISOString() },
      { id: "conn-secondary", isActive: true, consecutiveUseCount: 0, lastUsedAt: new Date(2000).toISOString() }
    ];
    localDbMocks.getProviderConnections.mockResolvedValue(conns);
    localDbMocks.getSettings.mockResolvedValue({});

    const initial = await getProviderCredentials("anthropic", null, "claude-3-7-sonnet", { sessionId: "sess-failover-test" });
    const primaryId = initial.connectionId;
    const secondaryId = conns.find((c) => c.id !== primaryId).id;

    const failover = await getProviderCredentials("anthropic", new Set([primaryId]), "claude-3-7-sonnet", { sessionId: "sess-failover-test" });
    expect(failover).not.toBeNull();
    expect(failover.connectionId).toBe(secondaryId);
    expect(failover.connectionId).not.toBe(primaryId);
  });

  it("exhibits minimal migration on connection removal", () => {
    const connections = [
      { id: "node-1" },
      { id: "node-2" },
      { id: "node-3" },
      { id: "node-4" },
      { id: "node-5" }
    ];
    const removedId = "node-3";
    const remainingConnections = connections.filter((c) => c.id !== removedId);

    for (let i = 0; i < 100; i++) {
      const sessionKey = `sess-${i}`;
      const initialTop = scoreAccounts(sessionKey, connections)[0].id;
      const newTop = scoreAccounts(sessionKey, remainingConnections)[0].id;

      if (initialTop !== removedId) {
        expect(newTop).toBe(initialTop);
      }
    }
  });

  it("releases lease on stream completion, cancel, and error", async () => {
    const releaseStream = reserveOAuthSession("conn-stream", "session-s1");
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(1);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([10, 20]));
        controller.close();
      }
    });

    const wrappedStream = wrapResponseWithOAuthSessionRelease(stream, releaseStream);
    const reader = wrappedStream.getReader();
    await reader.read();
    const finalChunk = await reader.read();
    expect(finalChunk.done).toBe(true);
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(0);

    const releaseResponse = reserveOAuthSession("conn-stream", "session-s2");
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(1);

    const response = new Response("response stream payload");
    const wrappedResponse = wrapResponseWithOAuthSessionRelease(response, releaseResponse);
    await wrappedResponse.text();
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(0);

    const releaseCancel = reserveOAuthSession("conn-stream", "session-s3");
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(1);

    const cancelStream = new ReadableStream({
      start() {}
    });
    const wrappedCancel = wrapResponseWithOAuthSessionRelease(cancelStream, releaseCancel);
    const cancelReader = wrappedCancel.getReader();
    await cancelReader.cancel();
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(0);

    const releaseError = reserveOAuthSession("conn-stream", "session-s4");
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(1);

    const errorStream = new ReadableStream({
      pull(controller) {
        controller.error(new Error("upstream broken"));
      }
    });
    const wrappedError = wrapResponseWithOAuthSessionRelease(errorStream, releaseError);
    const errorReader = wrappedError.getReader();
    await expect(errorReader.read()).rejects.toThrow("upstream broken");
    expect(getForeignOAuthSessionCount("conn-stream", "session-other")).toBe(0);
  });
});
