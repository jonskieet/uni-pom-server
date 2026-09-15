export interface DashboardPom {
  id: number;
  pom_code: string;
  project_name: string;
  customer_name?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
  total_amount: number;
  item_count: number;
}
export const STAGES = [
  {
    key: "preparation",
    label: "Soạn & duyệt",
    icon: "ti-file-check",
    statuses: ["draft", "submitted", "tp_approved"],
    color: "#94a3b8",
  },
  {
    key: "pricing",
    label: "Định giá",
    icon: "ti-calculator",
    statuses: ["pricing_done"],
    color: "#818cf8",
  },
  {
    key: "client",
    label: "Khách hàng",
    icon: "ti-messages",
    statuses: ["sent_to_client", "negotiating"],
    color: "#6366f1",
  },
  {
    key: "revision",
    label: "Cần điều chỉnh",
    icon: "ti-edit",
    statuses: ["revision_price", "revision_tech"],
    color: "#b45309",
  },
  {
    key: "won",
    label: "Đã chốt",
    icon: "ti-handshake",
    statuses: ["closed_won"],
    color: "#047857",
  },
  {
    key: "delivery",
    label: "Thi công & nghiệm thu",
    icon: "ti-building",
    statuses: ["construction", "inspection"],
    color: "#0e7490",
  },
  {
    key: "completed",
    label: "Đã bàn giao",
    icon: "ti-circle-check",
    statuses: ["project_completed"],
    color: "#059669",
  },
  {
    key: "lost",
    label: "Không chốt",
    icon: "ti-circle-x",
    statuses: ["closed_lost"],
    color: "#be123c",
  },
  {
    key: "exported",
    label: "Đã xuất (legacy)",
    icon: "ti-file-export",
    statuses: ["exported"],
    color: "#64748b",
  },
  {
    key: "other",
    label: "Khác / chưa xác định",
    icon: "ti-help",
    statuses: [],
    color: "#cbd5e1",
  },
];
export const WON_STATUSES = new Set([
  "closed_won",
  "construction",
  "inspection",
  "project_completed",
]);
const OPEN_STATUSES = new Set([
  "draft",
  "submitted",
  "tp_approved",
  "pricing_done",
  "sent_to_client",
  "negotiating",
  "revision_price",
  "revision_tech",
]);
export function normalizedStatus(status: string) {
  return status === "reviewed" ? "tp_approved" : status;
}
export function stageOf(status: string) {
  return (
    STAGES.find((s) => s.statuses.includes(normalizedStatus(status)))?.key ||
    "other"
  );
}
export function amountOf(p: DashboardPom) {
  const n = Number(p.total_amount);
  return Number.isFinite(n) ? n : 0;
}
export function isOpen(p: DashboardPom) {
  return OPEN_STATUSES.has(normalizedStatus(p.status));
}
export function isStale(p: DashboardPom, now = new Date()) {
  const updated = new Date(p.updated_at).getTime();
  return (
    isOpen(p) &&
    Number.isFinite(updated) &&
    now.getTime() - updated > 7 * 86400000
  );
}
export function filterCohort(
  rows: DashboardPom[],
  days: 0 | 30 | 90,
  now = new Date(),
) {
  if (!days) return rows;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return rows.filter((p) => {
    const created = new Date(p.created_at).getTime();
    return created >= start.getTime() && created <= now.getTime();
  });
}
export function monthKey(date: string | Date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function buildDashboardStats(rows: DashboardPom[], now = new Date()) {
  const counts: Record<string, number> = {};
  rows.forEach((p) => {
    const status = normalizedStatus(p.status);
    counts[status] = (counts[status] || 0) + 1;
  });
  const sum = (list: DashboardPom[]) =>
    list.reduce((total, p) => total + amountOf(p), 0);
  const open = rows.filter(isOpen),
    won = rows.filter((p) => WON_STATUSES.has(normalizedStatus(p.status)));
  const lost = counts.closed_lost || 0;
  const thisMonth = rows.filter(
    (p) => monthKey(p.created_at) === monthKey(now),
  ).length;
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = rows.filter(
    (p) => monthKey(p.created_at) === monthKey(previousDate),
  ).length;
  return {
    total: rows.length,
    totalValue: sum(rows),
    counts,
    openCount: open.length,
    openValue: sum(open),
    wonCount: won.length,
    wonValue: sum(won),
    average: rows.length ? sum(rows) / rows.length : 0,
    revisions: (counts.revision_price || 0) + (counts.revision_tech || 0),
    stale: rows.filter((p) => isStale(p, now)).length,
    missingValue: rows.filter((p) => amountOf(p) <= 0).length,
    winRate:
      won.length + lost
        ? Math.round((won.length / (won.length + lost)) * 100)
        : null,
    thisMonth,
    previousMonth,
    trend: previousMonth
      ? Math.round(((thisMonth - previousMonth) / previousMonth) * 100)
      : null,
    stages: STAGES.map((s) => {
      const list = rows.filter((p) => stageOf(p.status) === s.key);
      return {
        ...s,
        count: list.length,
        value: sum(list),
        percentage: rows.length ? (list.length / rows.length) * 100 : 0,
      };
    }),
  };
}
export function validateDashboardPayload(payload: any): DashboardPom[] {
  if (payload?.error) throw new Error(payload.error);
  if (
    !Array.isArray(payload?.rows) ||
    payload.total !== payload.rows.length ||
    new Set(payload.rows.map((p: any) => p.id)).size !== payload.total
  ) {
    throw new Error(
      "Nguồn dashboard không đầy đủ hoặc không hợp lệ. Vui lòng cập nhật máy chủ và thử lại.",
    );
  }
  return payload.rows;
}
