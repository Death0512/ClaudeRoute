import crypto from "node:crypto";

export function rendezvousScore(sessionKey, connectionId) {
  const hash = crypto.createHash("sha256").update(`${sessionKey}:${connectionId}`).digest();
  const val = hash.readBigUInt64BE(0);
  const floatVal = Number(val) / 18446744073709551616;
  return floatVal >= 1 ? 0.9999999999999999 : floatVal;
}

export function scoreAccounts(sessionKey, connections) {
  if (!Array.isArray(connections) || connections.length === 0) return [];
  const scored = connections.map((conn) => {
    const connId = conn?.id ?? conn?.connectionId ?? "";
    const score = rendezvousScore(sessionKey, connId);
    return { conn, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.conn);
}
