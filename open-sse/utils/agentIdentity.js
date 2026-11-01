const AGENT_KEY_HEADERS = ["x-claude-code-agent-id", "x-agent-id", "x-subagent-type", "x-agent-name"];
const AGENT_LABEL_HEADERS = ["x-claude-code-agent-type", "x-subagent-type", "x-agent-name"];

export function readAgentHeader(headers, key) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    const v = headers.get(key) ?? headers.get(key.toLowerCase());
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if (typeof headers !== "object") return null;
  const target = key.toLowerCase();
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() !== target) continue;
    const v = headers[name];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return null;
}

export function resolveAgentIdentity(headers) {
  let key = null;
  for (const name of AGENT_KEY_HEADERS) {
    const v = readAgentHeader(headers, name);
    if (v) { key = v; break; }
  }
  let label = null;
  for (const name of AGENT_LABEL_HEADERS) {
    const v = readAgentHeader(headers, name);
    if (v) { label = v; break; }
  }
  if (!label) label = key;
  return { key, label };
}
