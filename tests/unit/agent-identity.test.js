import { describe, it, expect } from "vitest";
import { resolveAgentIdentity } from "../../open-sse/utils/agentIdentity.js";
import { resolveSessionIdentity } from "../../open-sse/utils/sessionManager.js";

describe("Agent Identity & Session Routing", () => {
  it("resolves key and label from x-claude-code-agent-id with plain object and Headers instance", () => {
    const plain = { "x-claude-code-agent-id": "agent-12345678abcdef" };
    expect(resolveAgentIdentity(plain)).toEqual({
      key: "agent-12345678abcdef",
      label: "agent-12345678abcdef"
    });

    const headersInstance = new Headers();
    headersInstance.set("x-claude-code-agent-id", "agent-headers-instance-id");
    expect(resolveAgentIdentity(headersInstance)).toEqual({
      key: "agent-headers-instance-id",
      label: "agent-headers-instance-id"
    });
  });

  it("falls back to x-agent-id, x-subagent-type, or x-agent-name when x-claude-code-agent-id is absent", () => {
    expect(resolveAgentIdentity({ "x-agent-id": "custom-agent-id" })).toEqual({
      key: "custom-agent-id",
      label: "custom-agent-id"
    });

    expect(resolveAgentIdentity({ "x-subagent-type": "tester" })).toEqual({
      key: "tester",
      label: "tester"
    });

    expect(resolveAgentIdentity({ "x-agent-name": "reviewer" })).toEqual({
      key: "reviewer",
      label: "reviewer"
    });

    expect(resolveAgentIdentity({
      "x-agent-id": "key-id",
      "x-claude-code-agent-type": "coder"
    })).toEqual({
      key: "key-id",
      label: "coder"
    });
  });

  it("appends #agent=<id> to base session and yields different session ids for different agents", () => {
    const sessionUuid = "12345678-1234-4234-8234-123456789abc";
    const res1 = resolveSessionIdentity({
      headers: {
        "x-claude-code-session-id": sessionUuid,
        "x-claude-code-agent-id": "agent-1"
      }
    });
    const res2 = resolveSessionIdentity({
      headers: {
        "x-claude-code-session-id": sessionUuid,
        "x-claude-code-agent-id": "agent-2"
      }
    });

    expect(res1.sessionId).toBe(`claude:${sessionUuid}#agent=agent-1`);
    expect(res2.sessionId).toBe(`claude:${sessionUuid}#agent=agent-2`);
    expect(res1.sessionId).not.toBe(res2.sessionId);
  });

  it("leaves the session id unchanged when no agent header is present", () => {
    const sessionUuid = "abcdef12-1234-4234-8234-123456789abc";
    const res = resolveSessionIdentity({
      headers: {
        "x-claude-code-session-id": sessionUuid
      }
    });

    expect(res.sessionId).toBe(`claude:${sessionUuid}`);
  });

  it("replaces pre-existing terminal #agent= suffix instead of appending a second one", () => {
    const res = resolveSessionIdentity({
      headers: {
        "x-claude-code-agent-id": "agent-new"
      },
      body: {
        session_id: "claude:session-xyz#agent=agent-old"
      }
    });

    expect(res.sessionId).toBe("claude:session-xyz#agent=agent-new");
  });
});
