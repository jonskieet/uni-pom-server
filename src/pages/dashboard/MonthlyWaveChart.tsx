import { useId, useState } from "react";
import { integerWaveTicks, monotonePath } from "./monthlyWaveMath";

interface MonthlyWaveDatum {
  key: string;
  label: string;
  count: number;
  won: number;
}
export default function MonthlyWaveChart({
  data,
  unavailable,
  loading,
}: {
  data: MonthlyWaveDatum[];
  unavailable: boolean;
  loading: boolean;
}) {
  const id = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = focused ?? hovered;
  if (unavailable)
    return (
      <div className="db-empty" role="status">
        <i
          className={`ti ${loading ? "ti-loader-2 db-spin" : "ti-cloud-off"}`}
        />
        <h4>
          {loading ? "Đang tải biểu đồ theo tháng…" : "Chưa có dữ liệu biểu đồ"}
        </h4>
        <p>Biểu đồ chỉ hiển thị sau khi số liệu được tải thành công.</p>
      </div>
    );
  if (!data.length || data.every((d) => d.count === 0 && d.won === 0))
    return (
      <div className="db-empty">
        <i className="ti ti-chart-line" />
        <h4>Chưa có BOM được tạo trong 6 tháng này</h4>
        <p>
          Không có số liệu để thể hiện xu hướng. Các tháng không có BOM được
          tính là 0.
        </p>
      </div>
    );
  const width = 780,
    height = 270,
    left = 52,
    right = 30,
    top = 25,
    bottom = 225;
  const scale = integerWaveTicks(
    Math.max(...data.map((d) => Math.max(d.count, d.won))),
  );
  const x = (i: number) =>
    left + (i * (width - left - right)) / Math.max(data.length - 1, 1);
  const y = (value: number) => bottom - (value / scale.top) * (bottom - top);
  const totalPoints = data.map((d, i) => ({ x: x(i), y: y(d.count) }));
  const wonPoints = data.map((d, i) => ({ x: x(i), y: y(d.won) }));
  const totalPath = monotonePath(totalPoints),
    wonPath = monotonePath(wonPoints);
  const areaPath = `${totalPath} L ${x(data.length - 1)} ${bottom} L ${left} ${bottom} Z`;
  const selected = active === null ? null : data[active];
  const tooltip = selected
    ? `${selected.label}: ${selected.count} BOM được tạo · ${selected.won} BOM hiện đã chốt/triển khai`
    : "Di chuột hoặc dùng Tab tới điểm tháng để xem số liệu.";
  return (
    <figure className="db-wave">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
      >
        <title id={`${id}-title`}>
          Xu hướng BOM theo tháng · hai đường cùng thang số BOM
        </title>
        <desc id={`${id}-desc`}>
          Tổng BOM được tạo và số BOM hiện đã chốt hoặc triển khai thuộc tháng
          tạo đó. Trạng thái hiện tại, không lịch sử doanh số. Dùng Tab để xem
          từng tháng; đường cong không vượt giá trị giữa các điểm dữ liệu.
        </desc>
        <defs>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity=".14" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity=".01" />
          </linearGradient>
        </defs>
        <text x={left} y="12" className="db-wave-axis-title">
          Số BOM
        </text>
        {scale.ticks.map((tick) => (
          <g key={tick} aria-hidden="true">
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              className="db-wave-grid"
            />
            <text
              x={left - 12}
              y={y(tick) + 4}
              textAnchor="end"
              className="db-wave-axis"
            >
              {tick}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={`url(#${id}-area)`} aria-hidden="true" />
        <path d={totalPath} className="db-wave-total" aria-hidden="true" />
        <path d={wonPath} className="db-wave-won" aria-hidden="true" />
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={top}
            y2={bottom}
            className="db-wave-guide"
            aria-hidden="true"
          />
        )}
        {data.map((d, i) => (
          <g key={d.key}>
            <text
              x={x(i)}
              y={bottom + 26}
              textAnchor="middle"
              className="db-wave-axis"
              aria-hidden="true"
            >
              {d.label}
            </text>
            <circle
              cx={x(i)}
              cy={y(d.count)}
              r={active === i ? 5 : 3.5}
              className="db-wave-dot-total"
              aria-hidden="true"
            />
            <circle
              cx={x(i)}
              cy={y(d.won)}
              r={active === i ? 5 : 3.5}
              className="db-wave-dot-won"
              aria-hidden="true"
            />
            <rect
              x={x(i) - 17}
              y={top - 7}
              width="34"
              height={bottom - top + 42}
              rx="7"
              className="db-wave-hit"
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${d.count} BOM được tạo, ${d.won} BOM hiện đã chốt/triển khai`}
              aria-describedby={active === i ? `${id}-tooltip` : undefined}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
            >
              <title>{`${d.label}: ${d.count} BOM được tạo · ${d.won} hiện đã chốt/triển khai`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <figcaption
        id={`${id}-tooltip`}
        className={`db-wave-tooltip ${selected ? "is-active" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <i className="ti ti-chart-line" />
        {tooltip}
      </figcaption>
    </figure>
  );
}
