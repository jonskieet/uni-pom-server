import {
  useState,
  useMemo,
  useId,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store/auth";
import { PomService } from "../../services";
import { PageTransition } from "../../components/PageTransition";
import { Modal } from "../../components/ui";
import { shell, formatVND, STATUS_POM } from "../../styles/theme";
import {
  type DashboardPom,
  STAGES,
  WON_STATUSES,
  amountOf,
  normalizedStatus,
  stageOf,
  isOpen,
  isStale,
  filterCohort,
  monthKey,
  buildDashboardStats,
  validateDashboardPayload,
} from "./dashboardStats";
import "./DashboardPage.css";
import MonthlyWaveChart from "./MonthlyWaveChart";

function wrapAxisLabel(label: string): string[] {
  if (label.length <= 11) return [label];
  const words = label.split(" ");
  if (words.length === 1) return [label];
  let line1 = "";
  let line2 = "";
  for (const w of words) {
    if (!line1 || (line1 + " " + w).trim().length <= 11) {
      line1 = (line1 ? line1 + " " : "") + w;
    } else {
      line2 = (line2 ? line2 + " " : "") + w;
    }
  }
  return line2 ? [line1, line2] : [line1];
}

// ── smoothClosedPath — nối các đỉnh radar bằng đường cong Catmull-Rom
// (quy đổi sang Bezier) thay vì polygon góc cạnh, cho hình "blob" mềm
// mại hơn nhưng vẫn đi đúng qua từng điểm dữ liệu thật (không bịa số liệu).
function smoothClosedPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n < 3) return "";
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
  }
  return d + "Z";
}

// ── RadarChart — biểu đồ mạng nhện 5 trục, tham khảo bố cục "Stream A
// vs Stream B" của mẫu Prism: 2 đa giác chồng lên lưới ngũ giác, có
// chấm tại từng đỉnh + nhãn trục quanh viền. Tự co theo "max" của
// từng trục (không dùng thang cố định) để 2 đường luôn hiển thị rõ
// dù đơn vị các trục khác nhau (số lượng vs % vs VNĐ).
type RadarAxis = {
  label: string;
  a: number;
  b: number;
  max: number;
  format?: (v: number) => string;
};

function RadarChart({
  axes,
  colorA,
  colorB,
}: {
  axes: RadarAxis[];
  colorA: string;
  colorB: string;
}) {
  const gradId = useId();
  const n = axes.length;
  const cx = 150,
    cy = 126,
    R = 72;
  const angleFor = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n);

  const vertex = (i: number, pct: number) => {
    const a = angleFor(i);
    const r = R * Math.min(Math.max(pct, 0), 1);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const ringPoints = (pct: number) =>
    axes
      .map((_, i) => {
        const v = vertex(i, pct);
        return `${v.x},${v.y}`;
      })
      .join(" ");

  const dataVertices = (key: "a" | "b") =>
    axes.map((ax, i) => vertex(i, ax.max > 0 ? ax[key] / ax.max : 0));

  const hasData = axes.some((ax) => ax.a > 0 || ax.b > 0);

  return (
    <svg
      viewBox="0 0 300 250"
      style={{
        width: "100%",
        maxWidth: 340,
        height: "auto",
        display: "block",
        margin: "0 auto",
      }}
    >
      <defs>
        <linearGradient id={`${gradId}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorA} stopOpacity="0.30" />
          <stop offset="100%" stopColor={colorA} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${gradId}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorB} stopOpacity="0.26" />
          <stop offset="100%" stopColor={colorB} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Lưới ngũ giác nền — vòng trong cùng tô nhạt để tạo chiều sâu */}
      {[1, 0.66, 0.33].map((pct, idx) => (
        <polygon
          key={pct}
          points={ringPoints(pct)}
          fill={idx === 2 ? "#FAFBFD" : "none"}
          stroke="#EEF0F5"
          strokeWidth="1"
        />
      ))}
      {/* Trục từ tâm ra từng đỉnh */}
      {axes.map((_, i) => {
        const v = vertex(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={v.x}
            y2={v.y}
            stroke="#EEF0F5"
            strokeWidth="1"
          />
        );
      })}

      {hasData && (
        <>
          <path
            d={smoothClosedPath(dataVertices("b"))}
            fill={`url(#${gradId}-b)`}
            stroke={colorB}
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 2px 4px ${colorB}33)` }}
          />
          <path
            d={smoothClosedPath(dataVertices("a"))}
            fill={`url(#${gradId}-a)`}
            stroke={colorA}
            strokeWidth="2.25"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 2px 5px ${colorA}40)` }}
          />
          {axes.map((ax, i) => {
            const vb = vertex(i, ax.max > 0 ? ax.b / ax.max : 0);
            const va = vertex(i, ax.max > 0 ? ax.a / ax.max : 0);
            return (
              <g key={i}>
                <circle
                  cx={vb.x}
                  cy={vb.y}
                  r="5.5"
                  fill={colorB}
                  fillOpacity="0.14"
                />
                <circle
                  cx={vb.x}
                  cy={vb.y}
                  r="3"
                  fill="#fff"
                  stroke={colorB}
                  strokeWidth="2"
                />
                <circle
                  cx={va.x}
                  cy={va.y}
                  r="6"
                  fill={colorA}
                  fillOpacity="0.16"
                />
                <circle
                  cx={va.x}
                  cy={va.y}
                  r="3.4"
                  fill="#fff"
                  stroke={colorA}
                  strokeWidth="2.25"
                />
              </g>
            );
          })}
        </>
      )}

      {/* Nhãn trục quanh viền — tự xuống dòng nếu dài để không bị tràn/cắt chữ */}
      {axes.map((ax, i) => {
        const v = vertex(i, 1.33);
        const dx =
          Math.abs(v.x - cx) < 4 ? "middle" : v.x > cx ? "start" : "end";
        const lines = wrapAxisLabel(ax.label);
        const lineHeight = 11;
        const baseDy = v.y < cy - 4 ? -4 : v.y > cy + 4 ? 11 : 4;
        const startY = v.y + baseDy - ((lines.length - 1) * lineHeight) / 2;
        return (
          <text
            key={i}
            x={v.x}
            textAnchor={dx as any}
            fontSize="10"
            fontWeight={600}
            fill={shell.textTertiary}
          >
            {lines.map((ln, li) => (
              <tspan key={li} x={v.x} y={startY + li * lineHeight}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

type Signal = "all" | "open" | "won" | "revision" | "stale" | "missing";
function statusLabel(status: string) {
  const key = normalizedStatus(status);
  return (
    STATUS_POM[key as keyof typeof STATUS_POM]?.label ||
    (status ? `Khác: ${status}` : "Chưa xác định")
  );
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Chưa có dữ liệu"
    : date.toLocaleDateString("vi-VN");
}
function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="db-heading">
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardPom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [days, setDays] = useState<0 | 30 | 90>(0);
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("all");
  const [signal, setSignal] = useState<Signal>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DashboardPom | null>(null);
  const requestRef = useRef(0);
  const tableRef = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const payload = await PomService.getDashboard();
      const full = validateDashboardPayload(payload);
      if (request !== requestRef.current) return;
      setRows(full);
      setLoadedAt(new Date().toISOString());
      setError("");
      setDetail((previous) =>
        previous ? full.find((p) => p.id === previous.id) || null : null,
      );
    } catch (err: any) {
      if (request === requestRef.current)
        setError(err.message || "Không thể tải dashboard");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      ++requestRef.current;
    };
  }, [refresh]);
  const now = new Date();
  const cohort = useMemo(
    () => filterCohort(rows, days, now),
    [rows, days, loadedAt],
  );
  const stats = useMemo(
    () => buildDashboardStats(cohort, now),
    [cohort, loadedAt],
  );
  const fullStats = useMemo(
    () => buildDashboardStats(rows, now),
    [rows, loadedAt],
  );
  const unavailable = !loadedAt;
  const cohortLabel = days
    ? `BOM được tạo trong ${days} ngày gần nhất`
    : "Toàn bộ BOM được phép xem";
  const signalLabels: Record<Signal, string> = {
    all: "Tất cả",
    open: "Pipeline đang mở",
    won: "Đã chốt (gồm triển khai)",
    revision: "Cần điều chỉnh",
    stale: "Chưa cập nhật >7 ngày",
    missing: "Thiếu giá trị báo giá",
  };
  const filtered = useMemo(
    () =>
      cohort.filter((p) => {
        if (phase !== "all" && stageOf(p.status) !== phase) return false;
        if (status !== "all" && normalizedStatus(p.status) !== status)
          return false;
        if (signal === "open" && !isOpen(p)) return false;
        if (signal === "won" && !WON_STATUSES.has(normalizedStatus(p.status)))
          return false;
        if (signal === "revision" && stageOf(p.status) !== "revision")
          return false;
        if (signal === "stale" && !isStale(p, now)) return false;
        if (signal === "missing" && amountOf(p) > 0) return false;
        return `${p.pom_code} ${p.project_name} ${p.customer_name || ""}`
          .toLocaleLowerCase("vi")
          .includes(search.trim().toLocaleLowerCase("vi"));
      }),
    [cohort, phase, status, signal, search, loadedAt],
  );
  useEffect(() => {
    setPage(1);
  }, [days, phase, status, signal, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 15, currentPage * 15);
  const statuses = [
    ...new Set([
      ...STAGES.flatMap((s) => s.statuses),
      ...cohort.map((p) => normalizedStatus(p.status)),
    ]),
  ];
  function resetDrilldown() {
    setPhase("all");
    setStatus("all");
    setSignal("all");
    setSearch("");
    setPage(1);
  }
  function drill(nextPhase = "all", nextSignal: Signal = "all") {
    setPhase(nextPhase);
    setStatus("all");
    setSignal(nextSignal);
    setSearch("");
    setPage(1);
    tableRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  const metrics: Array<{
    label: string;
    value: string | number;
    sub: string;
    icon: string;
    signal: Signal;
  }> = [
    {
      label: "Tổng BOM",
      value: stats.total,
      sub: cohortLabel,
      icon: "ti-stack-2",
      signal: "all",
    },
    {
      label: "Giá trị báo giá",
      value: formatVND(stats.totalValue),
      sub: "Giá Sale nếu có · gồm VAT · không phải doanh thu",
      icon: "ti-currency-dong",
      signal: "all",
    },
    {
      label: "Pipeline đang mở",
      value: stats.openCount,
      sub: formatVND(stats.openValue) + " · trước chốt",
      icon: "ti-git-branch",
      signal: "open",
    },
    {
      label: "Đã chốt & triển khai",
      value: stats.wonCount,
      sub: formatVND(stats.wonValue) + " · chưa phải doanh thu",
      icon: "ti-handshake",
      signal: "won",
    },
    {
      label: "TB giá trị / BOM",
      value: formatVND(stats.average),
      sub: "Tổng giá trị chia toàn bộ BOM trong cohort",
      icon: "ti-chart-dots",
      signal: "all",
    },
    {
      label: "Cần điều chỉnh",
      value: stats.revisions,
      sub: `${stats.counts.revision_price || 0} sửa giá · ${stats.counts.revision_tech || 0} sửa kỹ thuật`,
      icon: "ti-edit",
      signal: "revision",
    },
    {
      label: "Chưa cập nhật >7 ngày",
      value: stats.stale,
      sub: "BOM đang mở · theo updated_at · không phải quá hạn",
      icon: "ti-clock-pause",
      signal: "stale",
    },
    {
      label: "Thiếu giá trị báo giá",
      value: stats.missingValue,
      sub: "Giá trị bằng 0 hoặc âm · cần kiểm tra",
      icon: "ti-file-alert",
      signal: "missing",
    },
  ];
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = monthKey(date);
    const list = rows.filter((p) => monthKey(p.created_at) === key);
    return {
      key,
      label: `T${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`,
      count: list.length,
      won: list.filter((p) => WON_STATUSES.has(normalizedStatus(p.status)))
        .length,
    };
  });
  const chartMax = Math.max(...months.map((m) => m.count), 1);
  const radarAxes = useMemo<RadarAxis[]>(() => {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const calc = (key: string) => {
      const list = rows.filter((p) => monthKey(p.created_at) === key);
      const summary = buildDashboardStats(list, now);
      return [
        summary.total,
        summary.totalValue,
        summary.winRate || 0,
        summary.revisions,
        list.length
          ? list.reduce((s, p) => s + p.item_count, 0) / list.length
          : 0,
      ];
    };
    const a = calc(monthKey(now)),
      b = calc(monthKey(previous));
    const labels = [
      "Số BOM",
      "Giá trị báo giá",
      "Tỷ lệ chốt",
      "Cần điều chỉnh",
      "TB dòng thiết bị",
    ];
    return labels.map((label, i) => ({
      label,
      a: a[i],
      b: b[i],
      max: i === 2 ? 100 : Math.max(a[i], b[i], 1),
    }));
  }, [rows, loadedAt]);
  const top = [...cohort]
    .filter((p) => amountOf(p) > 0)
    .sort((a, b) => amountOf(b) - amountOf(a))
    .slice(0, 5);
  const allowed = (key: string) =>
    user?.role === "admin" || user?.modules?.includes(key);
  const listAction =
    user?.role === "technical"
      ? { path: "/pom-history", module: "pom-history", label: "BOM của tôi" }
      : user?.role === "technical_lead"
        ? { path: "/lead-pom", module: "lead-pom", label: "Duyệt BOM" }
        : user?.role === "sales"
          ? { path: "/sale-pom", module: "my-pom", label: "BOM của tôi" }
          : user?.role === "sales_admin"
            ? {
                path: "/sale-admin-pom",
                module: "sale-admin-pom",
                label: "Định giá BOM",
              }
            : user?.role === "admin"
              ? {
                  path: "/admin-dashboard",
                  module: "admin-dashboard",
                  label: "Giám sát dự án",
                }
              : null;
  const canCreate =
    ["admin", "technical", "technical_lead"].includes(user?.role || "") &&
    allowed("create-pom");
  const canProducts =
    ["admin", "sales"].includes(user?.role || "") && allowed("products");
  const canForms =
    ["technical_lead", "sales_admin"].includes(user?.role || "") &&
    allowed("lead-solutions");
  return (
    <PageTransition>
      <div className="db-root">
        <header className="db-hero">
          <div>
            <span className="db-eyebrow">WORKSPACE / TỔNG QUAN</span>
            <h2>
              {now.getHours() < 12
                ? "Chào buổi sáng"
                : now.getHours() < 18
                  ? "Chào buổi chiều"
                  : "Chào buổi tối"}
              , {user?.full_name?.trim().split(/\s+/).pop() || "bạn"}
            </h2>
            <p>
              {now.toLocaleDateString("vi-VN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · Theo dõi báo giá và triển khai dự án.
            </p>
          </div>
          <div className="db-actions">
            {listAction && allowed(listAction.module) && (
              <button onClick={() => navigate(listAction.path)}>
                <i className="ti ti-file-invoice" />
                {listAction.label}
              </button>
            )}
            {canCreate && (
              <button
                className="db-primary"
                onClick={() => navigate("/create-pom")}
              >
                <i className="ti ti-plus" />
                Tạo BOM
              </button>
            )}
            {canProducts && (
              <button
                className="db-primary"
                onClick={() => navigate("/products")}
              >
                <i className="ti ti-package" />
                Sản phẩm
              </button>
            )}
            {canForms && (
              <button
                className="db-primary"
                onClick={() => navigate("/lead-solutions")}
              >
                <i className="ti ti-forms" />
                Form báo cáo
              </button>
            )}
          </div>
        </header>
        <div className="db-controls">
          <div>
            <div
              className="db-range"
              role="group"
              aria-label="Lọc theo ngày tạo BOM"
            >
              {([0, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  aria-pressed={days === d}
                  className={days === d ? "active" : ""}
                  onClick={() => {
                    setDays(d);
                    resetDrilldown();
                  }}
                >
                  {d ? `${d} ngày` : "Tất cả"}
                </button>
              ))}
            </div>
            <p>
              {cohortLabel}. Trạng thái hiện tại, không phải lịch sử chuyển
              trạng thái.
            </p>
          </div>
          <div className="db-refresh">
            <span role="status">
              {loading
                ? "Đang tải dữ liệu…"
                : loadedAt
                  ? `Tải thành công lúc ${new Date(loadedAt).toLocaleTimeString("vi-VN")}`
                  : "Chưa tải được dữ liệu"}
            </span>
            <button onClick={refresh} disabled={loading}>
              <i className={`ti ti-refresh ${loading ? "db-spin" : ""}`} />
              Làm mới
            </button>
          </div>
        </div>
        {error && (
          <div className="db-error" role="alert">
            <i className="ti ti-alert-circle" />
            <div>
              <strong>Không thể tải dashboard</strong>
              <p>
                {error}
                {loadedAt &&
                  " · Đang hiển thị bản dữ liệu thành công gần nhất."}
              </p>
            </div>
            <button onClick={refresh} disabled={loading}>
              Thử lại
            </button>
          </div>
        )}
        <div className="db-metrics">
          {metrics.map((m, i) => (
            <button
              key={m.label}
              className={`db-metric ${signal === m.signal && m.signal !== "all" ? "active" : ""}`}
              onClick={() => drill("all", m.signal)}
              disabled={unavailable}
              aria-label={`Xem ${m.label}`}
            >
              <span className="db-metric-label">
                <i className={`ti ${m.icon}`} />
                {m.label}
                <i className="ti ti-arrow-up-right" />
              </span>
              <strong>{unavailable ? "—" : m.value}</strong>
              <small>{m.sub}</small>
            </button>
          ))}
        </div>
        <section className="db-panel db-pipeline">
          <div className="db-panel-top">
            <SectionHeading
              title="Pipeline trạng thái BOM"
              sub="Phân bố trạng thái hiện tại · bấm giai đoạn để xem danh sách bên dưới"
            />
            <div className="db-rate">
              <strong>
                {unavailable || stats.winRate === null
                  ? "—"
                  : `${stats.winRate}%`}
              </strong>
              <span>Tỷ lệ chốt / (chốt + không chốt)</span>
            </div>
          </div>
          <div className="db-distribution" aria-label="Phân bố toàn bộ BOM">
            {stats.total ? (
              stats.stages
                .filter((s) => s.count)
                .map((s) => (
                  <button
                    key={s.key}
                    style={{ flexGrow: s.count, background: s.color }}
                    aria-label={`${s.label}: ${s.count} BOM, ${s.percentage.toFixed(1)}%`}
                    title={`${s.label}: ${s.count} BOM (${s.percentage.toFixed(1)}%)`}
                    onClick={() => drill(s.key)}
                  />
                ))
            ) : (
              <span>
                {unavailable
                  ? "Đang chờ dữ liệu"
                  : "Chưa có BOM trong khoảng đã chọn"}
              </span>
            )}
          </div>
          <div className="db-stages">
            {stats.stages.map((s) => (
              <button
                key={s.key}
                className={`db-stage ${phase === s.key ? "active" : ""}`}
                aria-pressed={phase === s.key}
                disabled={unavailable}
                onClick={() => drill(s.key)}
              >
                <span className="db-stage-label">
                  <i className={`ti ${s.icon}`} style={{ color: s.color }} />
                  {s.label}
                </span>
                <span className="db-stage-count">
                  <strong>{unavailable ? "—" : s.count}</strong>
                  <small>
                    {unavailable ? "—" : `${s.percentage.toFixed(1)}%`}
                  </small>
                </span>
                <span className="db-stage-value">
                  {unavailable ? "—" : formatVND(s.value)}
                </span>
              </button>
            ))}
          </div>
          <p className="db-note">
            “Đã chốt” chưa phải doanh thu; thi công/nghiệm thu chưa phải hoàn
            tất. Chỉ “Đã bàn giao” là project_completed. Đã xuất không được tính
            là chốt. Alias reviewed được gộp vào đã duyệt.
          </p>
        </section>
        <section className="db-panel" ref={tableRef}>
          <div className="db-panel-top">
            <SectionHeading
              title="Danh sách BOM"
              sub={`${unavailable ? "—" : filtered.length} kết quả · ${phase === "all" ? "Mọi giai đoạn" : STAGES.find((s) => s.key === phase)?.label} · ${signalLabels[signal]}`}
            />
            <button className="db-link" onClick={resetDrilldown}>
              Bỏ bộ lọc danh sách
            </button>
          </div>
          <div className="db-table-tools">
            <label className="db-search">
              <i className="ti ti-search" />
              <input
                aria-label="Tìm BOM, dự án hoặc khách hàng"
                placeholder="Tìm mã BOM, dự án, khách hàng…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Trạng thái
              <select
                aria-label="Lọc trạng thái BOM"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPhase("all");
                  setSignal("all");
                }}
              >
                <option value="all">Tất cả trạng thái</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {unavailable ? (
            <div className="db-empty" role="status">
              <i
                className={`ti ${loading ? "ti-loader-2 db-spin" : "ti-cloud-off"}`}
              />
              <h4>
                {loading
                  ? "Đang tải toàn bộ số liệu…"
                  : "Dữ liệu chưa sẵn sàng"}
              </h4>
              <p>
                {loading
                  ? "Dashboard không sử dụng dữ liệu phân trang của danh sách."
                  : "Hãy cập nhật máy chủ hoặc kiểm tra kết nối và thử lại."}
              </p>
            </div>
          ) : !filtered.length ? (
            <div className="db-empty">
              <i className="ti ti-list-search" />
              <h4>Không có BOM phù hợp</h4>
              <p>Thử bỏ bộ lọc danh sách hoặc chọn khoảng ngày rộng hơn.</p>
              <button onClick={resetDrilldown}>Bỏ bộ lọc danh sách</button>
            </div>
          ) : (
            <>
              <div className="db-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>BOM / Dự án</th>
                      <th>Trạng thái</th>
                      <th>Giá trị báo giá</th>
                      <th>Ngày tạo</th>
                      <th>Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="db-row-button"
                            onClick={() => setDetail(p)}
                          >
                            <strong>
                              {p.project_name || "(Chưa đặt tên)"}
                            </strong>
                            <small>
                              {p.pom_code} · {p.item_count} dòng thiết bị
                            </small>
                          </button>
                        </td>
                        <td>
                          <span className="db-status">
                            <i
                              style={{
                                background: STAGES.find(
                                  (s) => s.key === stageOf(p.status),
                                )?.color,
                              }}
                            />
                            {statusLabel(p.status)}
                          </span>
                        </td>
                        <td className="db-money">{formatVND(amountOf(p))}</td>
                        <td>{dateLabel(p.created_at)}</td>
                        <td>
                          <span className={isStale(p, now) ? "db-stale" : ""}>
                            {dateLabel(p.updated_at)}
                            {isStale(p, now) && (
                              <small>Chưa cập nhật &gt;7 ngày</small>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="db-pagination">
                <span>
                  {(currentPage - 1) * 15 + 1}–
                  {Math.min(currentPage * 15, filtered.length)} /{" "}
                  {filtered.length} BOM
                </span>
                <div>
                  <button
                    aria-label="Trang trước"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <i className="ti ti-chevron-left" />
                  </button>
                  <span>
                    Trang {currentPage}/{pageCount}
                  </span>
                  <button
                    aria-label="Trang sau"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <i className="ti ti-chevron-right" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
        <section className="db-panel">
          <SectionHeading
            title="Xu hướng BOM theo tháng"
            sub="Biểu đồ sóng 6 tháng · toàn bộ dữ liệu, không chịu bộ lọc ngày phía trên"
          />
          <div className="db-chart-legend">
            <span><i style={{ background: "#6366f1" }} />Tổng BOM được tạo</span>
            <span><i style={{ background: "#0f766e" }} />Hiện đã chốt/triển khai · đường nét đứt</span>
          </div>
          <MonthlyWaveChart data={months} unavailable={unavailable} loading={loading} />
          <p className="db-note">
            Trạng thái hiện tại của BOM được tạo trong tháng, không lịch sử doanh số.
            Hai đường dùng cùng thang số BOM; chỉ các điểm tháng là quan sát thực,
            đường cong nối điểm không phải số liệu theo ngày.
          </p>
        </section>
        <div className="db-chart-grid">
          <section className="db-panel">
            <div className="db-panel-top">
              <SectionHeading
                title="BOM được tạo trong 6 tháng"
                sub="Toàn bộ dữ liệu · không chịu bộ lọc ngày phía trên"
              />
              <span className="db-trend">
                {unavailable
                  ? "—"
                  : fullStats.trend === null
                    ? "Chưa có mốc so sánh"
                    : `${fullStats.trend > 0 ? "+" : ""}${fullStats.trend}% so tháng trước`}
              </span>
            </div>
            <div className="db-chart-legend">
              <span>
                <i style={{ background: "#6366f1" }} />
                BOM được tạo
              </span>
              <span>
                <i style={{ background: "#94a3b8" }} />
                Hiện đã chốt/triển khai
              </span>
            </div>
            <div className="db-bars">
              {months.map((m) => (
                <div key={m.key}>
                  <div className="db-bar-columns">
                    <span
                      style={{
                        height: `${(m.count / chartMax) * 100}%`,
                        background: "#6366f1",
                      }}
                      title={`${m.label}: ${m.count} BOM được tạo`}
                    />
                    <span
                      style={{
                        height: `${(m.won / chartMax) * 100}%`,
                        background: "#94a3b8",
                      }}
                      title={`${m.label}: ${m.won} BOM hiện đã chốt/triển khai`}
                    />
                  </div>
                  <strong>{unavailable ? "—" : m.count}</strong>
                  <small>{m.label}</small>
                </div>
              ))}
            </div>
            <p className="db-note">
              Đếm theo tháng tạo BOM và trạng thái hôm nay; không biểu diễn số
              hợp đồng chốt trong từng tháng.
            </p>
          </section>
          <section className="db-panel">
            <SectionHeading
              title="So sánh cohort tháng"
              sub="Tháng tạo hiện tại / tháng trước · toàn bộ dữ liệu, không chịu bộ lọc ngày"
            />
            <div className="db-chart-legend">
              <span>
                <i style={{ background: "#6366f1" }} />
                Tháng này
              </span>
              <span>
                <i style={{ background: "#94a3b8" }} />
                Tháng trước
              </span>
            </div>
            {unavailable ? (
              <div className="db-empty">
                <p>Dữ liệu chưa sẵn sàng.</p>
              </div>
            ) : (
              <RadarChart axes={radarAxes} colorA="#6366f1" colorB="#94a3b8" />
            )}
            <div className="db-radar-values">
              {radarAxes.map((a, i) => (
                <div key={a.label}>
                  <span>{a.label}</span>
                  <strong>
                    {unavailable
                      ? "—"
                      : i === 1
                        ? formatVND(a.a)
                        : i === 2
                          ? `${a.a}%`
                          : a.a.toFixed(i === 4 ? 1 : 0)}{" "}
                    /{" "}
                    {unavailable
                      ? "—"
                      : i === 1
                        ? formatVND(a.b)
                        : i === 2
                          ? `${a.b}%`
                          : a.b.toFixed(i === 4 ? 1 : 0)}
                  </strong>
                </div>
              ))}
            </div>
            <p className="db-note">
              Mỗi trục có thang riêng. Không có kết quả chốt được biểu diễn bằng
              0 trên radar, không phải tỷ lệ thực đo.
            </p>
          </section>
        </div>
        <section className="db-panel">
          <SectionHeading
            title="BOM có giá trị cao nhất"
            sub={`Top 5 báo giá · ${cohortLabel.toLowerCase()} · không gộp nhiều BOM thành một dự án`}
          />
          {unavailable ? (
            <p className="db-note">Dữ liệu chưa sẵn sàng.</p>
          ) : top.length ? (
            <div className="db-top-list">
              {top.map((p, i) => (
                <button key={p.id} onClick={() => setDetail(p)}>
                  <span className="db-rank">{i + 1}</span>
                  <span>
                    <strong>{p.project_name || p.pom_code}</strong>
                    <small>
                      {p.pom_code} · {statusLabel(p.status)}
                    </small>
                  </span>
                  <b>{formatVND(amountOf(p))}</b>
                  <i className="ti ti-chevron-right" />
                </button>
              ))}
            </div>
          ) : (
            <p className="db-note">
              Chưa có BOM có giá trị trong khoảng đã chọn.
            </p>
          )}
        </section>
        {detail && (
          <Modal
            title="Tổng quan BOM · chỉ đọc"
            width={620}
            onClose={() => setDetail(null)}
          >
            <div className="db-detail">
              <span className="db-eyebrow">{detail.pom_code}</span>
              <h3>{detail.project_name || "(Chưa đặt tên)"}</h3>
              <dl>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{statusLabel(detail.status)}</dd>
                </div>
                <div>
                  <dt>Khách hàng</dt>
                  <dd>{detail.customer_name || "Chưa có dữ liệu"}</dd>
                </div>
                <div>
                  <dt>Người tạo</dt>
                  <dd>{detail.created_by_name || "Chưa có dữ liệu"}</dd>
                </div>
                <div>
                  <dt>Giá trị báo giá (gồm VAT)</dt>
                  <dd>{formatVND(amountOf(detail))}</dd>
                </div>
                <div>
                  <dt>Số dòng thiết bị</dt>
                  <dd>{detail.item_count}</dd>
                </div>
                <div>
                  <dt>Ngày tạo / cập nhật</dt>
                  <dd>
                    {dateLabel(detail.created_at)} /{" "}
                    {dateLabel(detail.updated_at)}
                  </dd>
                </div>
              </dl>
              <p>
                Đây là bản tổng quan từ lần tải thành công gần nhất. Chỉnh sửa
                và phê duyệt trong module BOM theo quyền của bạn.
              </p>
            </div>
          </Modal>
        )}
      </div>
    </PageTransition>
  );
}
