const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, requireMock = require) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: requireMock,
  });
  return module.exports;
}
const math = load("src/pages/dashboard/monthlyWaveMath.ts");
function cubic(segment, t) {
  const u = 1 - t;
  return (
    u ** 3 * segment.start.y +
    3 * u ** 2 * t * segment.c1.y +
    3 * u * t ** 2 * segment.c2.y +
    t ** 3 * segment.end.y
  );
}
test("smoothing interpolates observations and never overshoots or becomes negative", () => {
  const fixtures = [
    [0, 12, 0, 7, 7, 1],
    [0, 0, 0, 0, 0, 0],
    [2, 2, 2, 2],
    [1, 2, 30, 31, 32],
    [40, 10, 9, 2, 0],
    [0, 1000, 1, 1000, 0],
  ];
  let seed = 41;
  for (let i = 0; i < 100; i++)
    fixtures.push(
      Array.from({ length: 6 }, () => {
        seed = (seed * 16807) % 2147483647;
        return seed % 1000;
      }),
    );
  for (const values of fixtures) {
    const points = values.map((y, i) => ({ x: i * i + i, y }));
    const segments = math.monotoneSegments(points);
    assert.equal(segments.length, values.length - 1);
    for (const segment of segments) {
      assert.equal(cubic(segment, 0), segment.start.y);
      assert.equal(cubic(segment, 1), segment.end.y);
      const min = Math.min(segment.start.y, segment.end.y),
        max = Math.max(segment.start.y, segment.end.y);
      for (let i = 0; i <= 100; i++) {
        const value = cubic(segment, i / 100);
        assert.ok(
          value >= min - 1e-9 && value <= max + 1e-9,
          `${value} outside [${min}, ${max}]`,
        );
      }
    }
  }
});
test("SVG paths cover empty, single, flat and invalid observations safely", () => {
  assert.equal(math.monotonePath([]), "");
  assert.equal(math.monotonePath([{ x: 4, y: 5 }]), "M 4 5");
  const path = math.monotonePath([
    { x: 0, y: 2 },
    { x: 3, y: 2 },
  ]);
  assert.equal(path, "M 0 2 C 1 2, 2 2, 3 2");
  assert.throws(() => math.monotonePath([{ x: 0, y: NaN }]));
  assert.throws(() =>
    math.monotonePath([
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]),
  );
  assert.throws(() =>
    math.monotonePath([
      { x: 2, y: 2 },
      { x: 1, y: 3 },
    ]),
  );
});
test("shared scale has readable integer ticks starting at zero and covering the maximum", () => {
  for (const maximum of [0, 1, 3, 6, 11, 27, 110, 9001]) {
    const { top, ticks } = math.integerWaveTicks(maximum);
    assert.ok(top >= maximum && top > 0);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], top);
    assert.ok(ticks.every(Number.isInteger));
    assert.ok(ticks.length <= 6);
  }
  assert.throws(() => math.integerWaveTicks(-1));
  assert.throws(() => math.integerWaveTicks(Infinity));
});
const Chart = load("src/pages/dashboard/MonthlyWaveChart.tsx", (name) =>
  name === "./monthlyWaveMath" ? math : require(name),
).default;
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const data = Array.from({ length: 6 }, (_, i) => ({
  key: `2026-${i + 1}`,
  label: `T${i + 1}/26`,
  count: i + 1,
  won: i,
}));
test("rendered chart exposes title/description, six keyboard-focusable months and live tooltip", () => {
  const html = renderToStaticMarkup(
    React.createElement(Chart, { data, unavailable: false, loading: false }),
  );
  assert.match(html, /<title/);
  assert.match(html, /<desc/);
  assert.match(html, /aria-labelledby=/);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 6);
  assert.match(
    html,
    /aria-label="T6\/26: 6 BOM được tạo, 5 BOM hiện đã chốt\/triển khai"/,
  );
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /db-wave-total/);
  assert.match(html, /db-wave-won/);
});
test("unavailable and empty data show truthful states without a fabricated curve", () => {
  const pending = renderToStaticMarkup(
    React.createElement(Chart, { data, unavailable: true, loading: true }),
  );
  assert.match(pending, /Đang tải biểu đồ/);
  assert.doesNotMatch(pending, /<path/);
  const failed = renderToStaticMarkup(
    React.createElement(Chart, { data, unavailable: true, loading: false }),
  );
  assert.match(failed, /Chưa có dữ liệu biểu đồ/);
  assert.doesNotMatch(failed, /<path/);
  const empty = renderToStaticMarkup(
    React.createElement(Chart, {
      data: data.map((d) => ({ ...d, count: 0, won: 0 })),
      unavailable: false,
      loading: false,
    }),
  );
  assert.match(empty, /Chưa có BOM được tạo/);
  assert.doesNotMatch(empty, /<path/);
});
