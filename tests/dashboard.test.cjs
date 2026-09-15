const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, requireMock, extras = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: mod.exports,
    module: mod,
    Date,
    Set,
    Map,
    console,
    require: requireMock,
    ...extras,
  });
  return mod.exports;
}
const helpers = load("src/pages/dashboard/dashboardStats.ts", () => {
  throw new Error("Unexpected dependency");
});
const now = new Date(2026, 8, 15, 12);
const pom = (id, status, amount = 100) => ({
  id,
  pom_code: `POM-${id}`,
  project_name: "Project",
  status,
  total_amount: amount,
  item_count: 1,
  created_at: new Date(2026, 8, 1).toISOString(),
  updated_at: now.toISOString(),
});

test("pipeline covers every status, folds reviewed, and retains unknown statuses", () => {
  const rows = helpers.STAGES.flatMap((s) => s.statuses).map((status, i) =>
    pom(i + 1, status),
  );
  rows.push(pom(100, "reviewed"), pom(101, "future_status"), pom(102, ""));
  const stats = helpers.buildDashboardStats(rows, now);
  assert.equal(stats.total, rows.length);
  assert.equal(stats.counts.tp_approved, 2);
  assert.equal(stats.counts.reviewed, undefined);
  assert.equal(
    stats.stages.reduce((s, stage) => s + stage.count, 0),
    rows.length,
  );
  assert.ok(
    Math.abs(stats.stages.reduce((s, stage) => s + stage.percentage, 0) - 100) <
      1e-9,
  );
  assert.equal(stats.stages.find((s) => s.key === "other").count, 2);
});
test("exported is neither won nor completed; construction/inspection are delivery", () => {
  const rows = [
    "closed_won",
    "construction",
    "inspection",
    "project_completed",
    "closed_lost",
    "exported",
    "draft",
  ].map((s, i) => pom(i, s));
  const stats = helpers.buildDashboardStats(rows, now);
  assert.equal(stats.wonCount, 4);
  assert.equal(stats.wonValue, 400);
  assert.equal(stats.winRate, 80);
  assert.equal(stats.openCount, 1);
  assert.equal(stats.openValue, 100);
  assert.equal(stats.stages.find((s) => s.key === "completed").count, 1);
  assert.equal(stats.stages.find((s) => s.key === "delivery").count, 2);
  assert.equal(helpers.stageOf("exported"), "exported");
});
test("empty totals are zero, percentages finite, missing comparison and win rate null", () => {
  const stats = helpers.buildDashboardStats([], now);
  assert.equal(stats.totalValue, 0);
  assert.equal(stats.average, 0);
  assert.equal(stats.winRate, null);
  assert.equal(stats.trend, null);
  assert.ok(stats.stages.every((s) => s.percentage === 0));
  assert.equal(helpers.buildDashboardStats([pom(1, "draft")], now).trend, null);
});
test("stale uses updated_at, only open BOM and strictly more than 7 days", () => {
  const old = new Date(now.getTime() - 8 * 86400000).toISOString();
  const rows = [
    { ...pom(1, "draft"), updated_at: old },
    { ...pom(2, "closed_won"), updated_at: old },
    {
      ...pom(3, "revision_price"),
      updated_at: new Date(now.getTime() - 7 * 86400000).toISOString(),
    },
    { ...pom(4, "draft"), updated_at: "invalid" },
  ];
  assert.equal(helpers.buildDashboardStats(rows, now).stale, 1);
});
test("revision, average and missing quote totals use actual cohort", () => {
  const stats = helpers.buildDashboardStats(
    [
      pom(1, "revision_price", 0),
      pom(2, "revision_tech", -1),
      pom(3, "draft", 301),
    ],
    now,
  );
  assert.equal(stats.revisions, 2);
  assert.equal(stats.missingValue, 2);
  assert.equal(stats.average, 100);
});
test("30/90 day cohort uses local calendar boundaries and created_at, not updated_at", () => {
  const boundary = new Date(now);
  boundary.setHours(0, 0, 0, 0);
  boundary.setDate(boundary.getDate() - 29);
  const rows = [
    { ...pom(1, "draft"), created_at: boundary.toISOString() },
    {
      ...pom(2, "draft"),
      created_at: new Date(boundary.getTime() - 1).toISOString(),
    },
    {
      ...pom(3, "draft"),
      created_at: new Date(now.getTime() + 1).toISOString(),
    },
  ];
  assert.equal(helpers.filterCohort(rows, 30, now).length, 1);
  assert.equal(helpers.filterCohort(rows, 90, now).length, 2);
  assert.equal(helpers.filterCohort(rows, 0, now).length, 3);
});
test("dashboard payload refuses paginated, incomplete, duplicate or error data", () => {
  const rows = Array.from({ length: 25 }, (_, i) => pom(i, "draft"));
  assert.equal(
    helpers.validateDashboardPayload({ rows, total: 25 }).length,
    25,
  );
  assert.throws(() =>
    helpers.validateDashboardPayload({ rows: rows.slice(0, 20), total: 25 }),
  );
  assert.throws(() =>
    helpers.validateDashboardPayload({ data: rows, pagination: { total: 25 } }),
  );
  assert.throws(() =>
    helpers.validateDashboardPayload({ rows: [rows[0], rows[0]], total: 2 }),
  );
  assert.throws(
    () => helpers.validateDashboardPayload({ error: "Unauthorized" }),
    /Unauthorized/,
  );
});
function endpoint(db) {
  return load(
    "server/src/controllers/pomsDashboard.ts",
    (name) => {
      if (name === "@prisma/client")
        return {
          PrismaClient: class {
            constructor() {
              return db;
            }
          },
        };
      if (name.endsWith("/errorHandler")) return { asyncHandler: (fn) => fn };
      if (name.endsWith("/response"))
        return { successResponse: (data) => ({ success: true, data }) };
      throw new Error(name);
    },
    { global: {} },
  );
}
test("endpoint returns all 25 lightweight rows with one aggregate query, no pagination or enrich", async () => {
  let calls = 0;
  const controller = endpoint({
    $queryRaw: async (parts) => {
      calls++;
      const sql = parts.join("?");
      assert.match(sql, /GROUP BY pom_id/);
      assert.match(sql, /COALESCE\(sale_price, unit_price\)/);
      assert.doesNotMatch(sql, /\bLIMIT\b|\bOFFSET\b|contacts|products/i);
      return Array.from({ length: 25 }, (_, i) => ({
        ...pom(i, "draft"),
        total_amount: "123.50",
      }));
    },
  });
  const res = {
    json(data) {
      this.data = data;
    },
  };
  await controller.getPomsDashboard({}, res);
  assert.equal(calls, 1);
  assert.equal(res.data.data.rows.length, 25);
  assert.equal(res.data.data.total, 25);
  assert.equal(res.data.data.rows[0].total_amount, 123.5);
});
test("endpoint surfaces database failure rather than successful empty dashboard", async () => {
  const controller = endpoint({
    $queryRaw: async () => {
      throw new Error("Database unavailable");
    },
  });
  let replied = false;
  await assert.rejects(
    controller.getPomsDashboard(
      {},
      {
        json() {
          replied = true;
        },
      },
    ),
    /Database unavailable/,
  );
  assert.equal(replied, false);
});
test("dashboard route precedes :id and shares list authentication/anyRole", () => {
  const routes = [],
    uses = [];
  const router = {
    use: (x) => uses.push(x),
    get: (...args) => routes.push(args),
    post() {},
    put() {},
    delete() {},
  };
  const auth = { authMiddleware: () => {}, anyRole: () => {} };
  load("server/src/routes/poms.ts", (name) => {
    if (name === "express") return { Router: () => router };
    if (name.endsWith("/auth")) return auth;
    if (name.endsWith("/pomsDashboard")) return { getPomsDashboard: () => {} };
    if (name.endsWith("/poms")) return new Proxy({}, { get: () => () => {} });
    throw new Error(name);
  });
  assert.equal(uses[0], auth.authMiddleware);
  assert.equal(
    routes.find((r) => r[0] === "/dashboard")[1],
    routes.find((r) => r[0] === "/")[1],
  );
  assert.equal(routes.find((r) => r[0] === "/dashboard")[1], auth.anyRole);
  assert.ok(
    routes.findIndex((r) => r[0] === "/dashboard") <
      routes.findIndex((r) => r[0] === "/:id"),
  );
});
