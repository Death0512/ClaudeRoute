"use client";

import { useState, useEffect, useRef } from "react";
import {
  FREE_PROVIDERS,
  AI_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";
import Card from "./Card";
import dynamic from "next/dynamic";

const ProviderTopology = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"), { ssr: false });

const fmt = (n) => new Intl.NumberFormat().format(n || 0);

function isLLMProvider(id) {
  if (isOpenAICompatibleProvider(id) || isAnthropicCompatibleProvider(id)) return true;
  const p = AI_PROVIDERS[id];
  if (!p) return false;
  if (!p.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return <>{timeAgo(timestamp)}</>;
}

function ActiveDispatches({ requests = [] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!requests.length) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [requests.length]);

  if (!requests.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-bg-subtle/30 text-xs text-text-muted shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
        <span className="font-mono text-[11px]">Active Agent Dispatches: Idle</span>
      </div>
    );
  }

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden shrink-0" padding="sm">
      <div className="px-1 py-1.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs font-semibold text-text uppercase tracking-wide">
            Active Agent Dispatches
          </span>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
          {requests.length} active
        </span>
      </div>
      <div className="max-h-[160px] overflow-y-auto divide-y divide-border/40">
        {requests.map((r, i) => {
          const startedAt = r.startedAt || now;
          const elapsed = Math.max(0, (now - startedAt) / 1000).toFixed(1);
          return (
            <div key={r.id || i} className="py-2 px-1 flex items-center gap-2 text-xs hover:bg-bg-subtle/50 transition-colors">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0 font-mono">
                {r.agent || "Agent"}
              </span>
              <span className="text-text-muted text-[11px] shrink-0">➜</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-subtle text-text border border-border/60 shrink-0">
                <span className="text-primary font-semibold">{r.provider}</span>
                {r.account && (
                  <span className="text-text-muted ml-1 max-w-[80px] truncate inline-block align-bottom" title={r.account}>
                    ({r.account})
                  </span>
                )}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-muted text-text-muted border border-border/40 truncate max-w-[110px]" title={r.model}>
                {r.model}
              </span>
              <span className="text-[10px] font-mono text-warning font-medium ml-auto pl-1 shrink-0">
                {elapsed}s
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RecentRequests({ requests = [] }) {
  return (
    <Card className="flex min-w-0 flex-1 flex-col overflow-hidden" padding="sm">
      <div className="px-1 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Recent Requests</span>
      </div>

      {!requests.length ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">No requests yet.</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full min-w-[300px] border-collapse text-xs">
            <thead className="sticky top-0 bg-bg z-10">
              <tr className="border-b border-border">
                <th className="py-1.5 text-left font-semibold text-text-muted w-2"></th>
                <th className="py-1.5 text-left font-semibold text-text-muted">Model</th>
                <th className="py-1.5 text-right font-semibold text-text-muted whitespace-nowrap">In / Out</th>
                <th className="py-1.5 text-right font-semibold text-text-muted">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {requests.map((r, i) => {
                const ok = !r.status || r.status === "ok" || r.status === "success";
                return (
                  <tr key={i} className="hover:bg-bg-subtle transition-colors">
                    <td className="py-1.5">
                      <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-error"}`} />
                    </td>
                    <td className="py-1.5 font-mono truncate max-w-[120px]" title={r.model}>{r.model}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <span className="text-primary">{fmt(r.promptTokens)}↑</span>
                      {" "}
                      <span className="text-success">{fmt(r.completionTokens)}↓</span>
                    </td>
                    <td className="py-1.5 text-right text-text-muted whitespace-nowrap"><TimeAgo timestamp={r.timestamp} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const PERIODS = [{ value: "today", label: "Today" }];

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/provider-nodes").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, nodesData]) => {
        const nodeNameMap = {};
        for (const node of (nodesData?.nodes || [])) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || []).filter((c) => {
          if (!c.isActive || c.isActive === 0 || c.isActive === "0" || c.isActive === false) return false;
          if (c.testStatus === "error" || c.testStatus === "unavailable") return false;
          const isCompatible = isOpenAICompatibleProvider(c.provider) || isAnthropicCompatibleProvider(c.provider);
          if (!AI_PROVIDERS[c.provider] && !isCompatible) return false;
          if (!isLLMProvider(c.provider)) return false;
          if (AI_PROVIDERS[c.provider]?.hidden) return false;
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        }).map((c) => ({
          ...c,
          nodeName: nodeNameMap[c.provider] || null,
        }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !p.hidden && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]);

  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, []);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-6 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
          )}
        </div>
      )}

      {loading ? spinner : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <ProviderTopology
            providers={providers}
            activeRequests={stats.activeRequests || []}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <div className="flex flex-col gap-2 min-w-0 sm:h-[480px]">
            <ActiveDispatches requests={stats.activeRequests || []} />
            <RecentRequests requests={stats.recentRequests || []} />
          </div>
        </div>
      )}
    </div>
  );
}
