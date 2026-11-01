const DEFAULT_LEASE_MS = 600000;
const MAX_CONNECTIONS = 1000;
const MAX_SESSIONS_PER_CONNECTION = 1000;

const occupancy = new Map();

function prune(now = Date.now()) {
  for (const [connectionId, sessions] of occupancy) {
    for (const [sessionKey, lease] of sessions) {
      if (lease.expiresAt <= now) {
        sessions.delete(sessionKey);
      }
    }
    if (sessions.size === 0) {
      occupancy.delete(connectionId);
    }
  }
}

export function getForeignOAuthSessionCount(connectionId, sessionKey, now = Date.now()) {
  if (!connectionId) return 0;
  prune(now);
  const sessions = occupancy.get(connectionId);
  if (!sessions) return 0;
  let count = 0;
  for (const key of sessions.keys()) {
    if (!sessionKey || key !== sessionKey) {
      count++;
    }
  }
  return count;
}

export function getOAuthSessionAvailability(connectionId, sessionKey, now = Date.now()) {
  return 1 / (1 + getForeignOAuthSessionCount(connectionId, sessionKey, now));
}

export function reserveOAuthSession(connectionId, sessionKey, leaseMs = DEFAULT_LEASE_MS, now = Date.now()) {
  if (!connectionId || !sessionKey) return () => {};
  prune(now);
  if (!occupancy.has(connectionId) && occupancy.size >= MAX_CONNECTIONS) {
    const firstKey = occupancy.keys().next().value;
    if (firstKey) occupancy.delete(firstKey);
  }
  let sessions = occupancy.get(connectionId);
  if (!sessions) {
    sessions = new Map();
    occupancy.set(connectionId, sessions);
  }
  if (!sessions.has(sessionKey) && sessions.size >= MAX_SESSIONS_PER_CONNECTION) {
    const firstKey = sessions.keys().next().value;
    if (firstKey) sessions.delete(firstKey);
  }
  const current = sessions.get(sessionKey);
  sessions.set(sessionKey, {
    requests: (current?.requests ?? 0) + 1,
    expiresAt: now + Math.max(1, leaseMs)
  });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const activeSessions = occupancy.get(connectionId);
    const active = activeSessions?.get(sessionKey);
    if (!activeSessions || !active) return;
    if (active.requests <= 1) {
      activeSessions.delete(sessionKey);
    } else {
      activeSessions.set(sessionKey, { ...active, requests: active.requests - 1 });
    }
    if (activeSessions.size === 0) {
      occupancy.delete(connectionId);
    }
  };
}

export function wrapResponseWithOAuthSessionRelease(response, release) {
  if (!response) {
    if (typeof release === "function") release();
    return response;
  }
  let released = false;
  const safeRelease = () => {
    if (!released) {
      released = true;
      if (typeof release === "function") release();
    }
  };

  const isStream = typeof response.getReader === "function" || (typeof ReadableStream !== "undefined" && response instanceof ReadableStream);
  const isResponse = typeof Response !== "undefined" && response instanceof Response;

  if (!isStream && !isResponse) {
    safeRelease();
    return response;
  }

  const stream = isStream ? response : response.body;
  if (!stream) {
    safeRelease();
    return response;
  }

  const reader = stream.getReader();
  const wrappedStream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          safeRelease();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        safeRelease();
        controller.error(error);
      }
    },
    async cancel(reason) {
      safeRelease();
      try {
        await reader.cancel(reason);
      } catch {}
    }
  });

  if (isStream) {
    return wrappedStream;
  }

  return new Response(wrappedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

export function _clearForTest() {
  occupancy.clear();
}

export const _clearOAuthSessionOccupancyForTest = _clearForTest;
