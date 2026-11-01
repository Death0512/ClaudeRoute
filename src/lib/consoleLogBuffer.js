import { EventEmitter } from "events";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"];

if (!global._consoleLogBufferState) {
  global._consoleLogBufferState = {
    logs: [],
    patched: false,
    originals: {},
    emitter: new EventEmitter(),
  };
  global._consoleLogBufferState.emitter.setMaxListeners(50);
}

const state = global._consoleLogBufferState;

if (!state.emitter) {
  state.emitter = new EventEmitter();
  state.emitter.setMaxListeners(50);
}

if (!state.pendingLines) state.pendingLines = [];
if (!state.flushTimer) state.flushTimer = null;

const FLUSH_INTERVAL_MS = 100;
const MAX_BATCH_LINES = 50;

const NOISE_PATTERNS = [
  "HEAD /api/",
  "OPTIONS /api/",
  "GET /favicon.ico",
  "GET /manifest.webmanifest",
  "GET /providers/",
  "GET /icons/",
  "GET /_next/",
  "[DB] Driver:",
  "▲ Next.js",
  "✓ Generating static pages",
  "Collecting page data",
  "Creating an optimized production build",
  "Finalizing page optimization",
  "Collecting build traces",
  "Fast Refresh",
  "Compiled",
  "Compiling",
  "[AutoPing]",
  "[ProxyFetch]",
  "[DBG:",
  "[CURSOR BUFFER]",
  "[UsageTracker]",
  "[BackgroundTokenRefresh]",
  "[OAuthModal] Polling",
];

const API_GET_FILTER_RE = /GET \/api\/(?!v1(?:\/|\s|$|\?))/i;

function isNoise(text) {
  if (API_GET_FILTER_RE.test(text)) return true;
  return NOISE_PATTERNS.some((pattern) => text.includes(pattern));
}

function flushPendingLines() {
  state.flushTimer = null;
  if (!state.pendingLines.length) return;

  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  state.emitter.emit("lines", lines);
}

function scheduleFlush() {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
  state.flushTimer?.unref?.();
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return str.replace(ANSI_RE, "");
}

function formatArg(arg) {
  if (typeof arg === "string") return stripAnsi(arg);
  if (arg instanceof Error) return stripAnsi(arg.stack || arg.message || String(arg));
  try {
    return stripAnsi(JSON.stringify(arg));
  } catch {
    return stripAnsi(String(arg));
  }
}

function toLogLine(level, args) {
  const raw = args.map(formatArg).join(" ").trim();
  if (!raw || isNoise(raw)) return null;

  const upperLevel = (level || "info").toUpperCase();
  const timeRegex = /^\[\d{2}:\d{2}:\d{2}\]/;
  const levelRegex = /^\[(LOG|INFO|WARN|ERROR|DEBUG)\]/i;

  let text = raw;
  let timePrefix = "";
  if (timeRegex.test(text)) {
    const timeMatch = text.match(timeRegex);
    timePrefix = timeMatch[0] + " ";
    text = text.slice(timeMatch[0].length).trimStart();
  } else {
    timePrefix = `${getTimestamp()} `;
  }

  let levelPrefix = "";
  if (levelRegex.test(text)) {
    const levelMatch = text.match(levelRegex);
    levelPrefix = `[${levelMatch[1].toUpperCase()}] `;
    text = text.slice(levelMatch[0].length).trimStart();
  } else {
    levelPrefix = `[${upperLevel}] `;
  }

  text = text.trim();
  if (!text || isNoise(text)) return null;

  return `${timePrefix}${levelPrefix}${text}`;
}

function appendLine(line) {
  if (!line || isNoise(line)) return;
  state.logs.push(line);
  const maxLines = CONSOLE_LOG_CONFIG.maxLines;
  if (state.logs.length > maxLines) {
    state.logs = state.logs.slice(-maxLines);
  }
  state.pendingLines.push(line);
  if (state.pendingLines.length >= MAX_BATCH_LINES) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    flushPendingLines();
  } else {
    scheduleFlush();
  }
}

export function initConsoleLogCapture() {
  if (state.patched) return;

  for (const level of consoleLevels) {
    state.originals[level] = console[level];
    console[level] = (...args) => {
      const line = toLogLine(level, args);
      if (line !== null) {
        appendLine(line);
      }
      state.originals[level](...args);
    };
  }

  state.patched = true;
}

export function getConsoleLogs() {
  return state.logs;
}

export function clearConsoleLogs() {
  state.logs = [];
  state.emitter.emit("clear");
}

export function getConsoleEmitter() {
  return state.emitter;
}
