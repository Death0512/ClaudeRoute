import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let adapter;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-retention-test-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  const { getAdapter } = await import("@/lib/db/driver.js");
  adapter = await getAdapter();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("1-day usage retention", () => {
  it("purgeOldUsageData deletes records older than 1 day and preserves recent records", async () => {
    adapter.run("DELETE FROM usageHistory");
    adapter.run("DELETE FROM usageDaily");
    adapter.run("DELETE FROM requestDetails");

    const now = Date.now();
    const oldTimestamp = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const recentTimestamp = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const oldDateKey = "2020-01-01";
    const nowDate = new Date(now);
    const recentDateKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;

    adapter.run(
      `INSERT INTO usageHistory(timestamp, provider, model, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [oldTimestamp, "test-p", "test-m", 10, 10, 0, "ok", "{}", "{}"]
    );
    adapter.run(
      `INSERT INTO usageHistory(timestamp, provider, model, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recentTimestamp, "test-p", "test-m", 10, 10, 0, "ok", "{}", "{}"]
    );

    adapter.run(`INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)`, [oldDateKey, "{}"]);
    adapter.run(`INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)`, [recentDateKey, "{}"]);

    adapter.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, status, data) VALUES(?, ?, ?, ?, ?, ?)`,
      ["old-req", oldTimestamp, "test-p", "test-m", "ok", "{}"]
    );
    adapter.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, status, data) VALUES(?, ?, ?, ?, ?, ?)`,
      ["recent-req", recentTimestamp, "test-p", "test-m", "ok", "{}"]
    );

    await db.purgeOldUsageData();

    const historyRows = adapter.all(`SELECT timestamp FROM usageHistory ORDER BY timestamp ASC`);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].timestamp).toBe(recentTimestamp);

    const dailyRows = adapter.all(`SELECT dateKey FROM usageDaily ORDER BY dateKey ASC`);
    expect(dailyRows).toHaveLength(1);
    expect(dailyRows[0].dateKey).toBe(recentDateKey);

    const detailRows = adapter.all(`SELECT id FROM requestDetails ORDER BY id ASC`);
    expect(detailRows).toHaveLength(1);
    expect(detailRows[0].id).toBe("recent-req");
  });

  it("flushToDatabase purges requestDetails older than 24h", async () => {
    adapter.run("DELETE FROM requestDetails");
    await db.updateSettings({ enableObservability: true, observabilityBatchSize: 1 });

    const now = Date.now();
    const oldTimestamp = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    adapter.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, status, data) VALUES(?, ?, ?, ?, ?, ?)`,
      ["old-detail", oldTimestamp, "test-p", "test-m", "ok", "{}"]
    );

    await db.saveRequestDetail({
      id: "new-detail",
      model: "test-m",
      provider: "test-p",
      timestamp: new Date().toISOString(),
    });

    await db.getRequestDetails();

    const rows = adapter.all(`SELECT id FROM requestDetails WHERE id = 'old-detail'`);
    expect(rows).toHaveLength(0);
  });

  it("Usage page and UsageStats PERIODS only contain today", () => {
    const usagePageContent = fs.readFileSync(
      new URL("../../src/app/(dashboard)/dashboard/usage/page.js", import.meta.url),
      "utf-8"
    );
    const usageStatsContent = fs.readFileSync(
      new URL("../../src/shared/components/UsageStats.js", import.meta.url),
      "utf-8"
    );

    const expectedPeriods = `const PERIODS = [{ value: "today", label: "Today" }];`;

    expect(usagePageContent).toContain(expectedPeriods);
    expect(usageStatsContent).toContain(expectedPeriods);

    expect(usagePageContent).not.toContain('{ value: "24h"');
    expect(usagePageContent).not.toContain('{ value: "7d"');
    expect(usagePageContent).not.toContain('{ value: "30d"');
    expect(usagePageContent).not.toContain('{ value: "60d"');
    expect(usagePageContent).not.toContain('{ value: "all"');

    expect(usageStatsContent).not.toContain('{ value: "24h"');
    expect(usageStatsContent).not.toContain('{ value: "7d"');
    expect(usageStatsContent).not.toContain('{ value: "30d"');
    expect(usageStatsContent).not.toContain('{ value: "60d"');
    expect(usageStatsContent).not.toContain('{ value: "all"');
  });
});
