"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Button, SegmentedControl } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LEVEL_STYLES = {
  LOG: "text-zinc-400 font-semibold",
  INFO: "text-sky-400 font-semibold",
  WARN: "text-amber-400 font-semibold",
  ERROR: "text-rose-400 font-semibold",
  DEBUG: "text-purple-400 font-semibold",
};

const LEVEL_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "INFO", label: "Info" },
  { value: "WARN", label: "Warn" },
  { value: "ERROR", label: "Error" },
];

function getLineLevel(line) {
  const match = line.match(/\[(LOG|INFO|WARN|ERROR|DEBUG)\]/i);
  return match ? match[1].toUpperCase() : "LOG";
}

function matchesFilter(line, filter) {
  if (filter === "ALL") return true;
  const level = getLineLevel(line);
  if (filter === "INFO") return level === "INFO" || level === "LOG";
  return level === filter;
}

function renderLogLine(line) {
  const match = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s*(?:\[(LOG|INFO|WARN|ERROR|DEBUG)\])?\s*(.*)$/i);
  if (!match) {
    return <span className="text-zinc-200 break-words">{line}</span>;
  }
  const [, timestamp, level, message] = match;
  const upperLevel = (level || "LOG").toUpperCase();
  const levelStyle = LEVEL_STYLES[upperLevel] || LEVEL_STYLES.LOG;

  return (
    <div className="flex items-start gap-2 leading-relaxed">
      <span className="text-zinc-500 select-none shrink-0 font-mono text-[11px] pt-0.5">{timestamp}</span>
      {level && <span className={`shrink-0 font-mono text-[11px] pt-0.5 ${levelStyle}`}>[{upperLevel}]</span>}
      <span className="text-zinc-200 break-all flex-1 font-mono">{message}</span>
    </div>
  );
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const logRef = useRef(null);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((line) => {
      if (!matchesFilter(line, levelFilter)) return false;
      if (query && !line.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [logs, levelFilter, searchQuery]);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        setLogs((prev) => {
          const next = [...prev, msg.line];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "lines") {
        setLogs((prev) => {
          const next = [...prev, ...msg.lines];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [filteredLogs]);

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedControl
              size="sm"
              value={levelFilter}
              onChange={setLevelFilter}
              options={LEVEL_OPTIONS}
            />
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-44 sm:w-64 bg-surface-2 border border-border/40 rounded-lg px-2.5 py-1 text-xs text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              />
            </div>
            <span className="text-xs text-text-muted">
              {filteredLogs.length} {filteredLogs.length === 1 ? "line" : "lines"}
            </span>
          </div>
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
        <div
          ref={logRef}
          className="bg-black rounded-b-lg p-4 text-xs font-mono h-[calc(100vh-220px)] overflow-y-auto"
        >
          {filteredLogs.length === 0 ? (
            <span className="text-text-muted">No console logs yet.</span>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((line, i) => (
                <div key={i}>{renderLogLine(line)}</div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
