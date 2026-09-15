export interface WavePoint {
  x: number;
  y: number;
}
export interface WaveSegment {
  start: WavePoint;
  end: WavePoint;
  c1: WavePoint;
  c2: WavePoint;
}

// Fritsch–Carlson monotone Hermite interpolation. Flatten at extrema and
// limit tangents so each segment stays between its two actual observations.
export function monotoneSegments(points: WavePoint[]): WaveSegment[] {
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error("Wave points must be finite");
  }
  if (points.length < 2) return [];
  const slopes = points.slice(1).map((p, i) => {
    const width = p.x - points[i].x;
    if (width <= 0) throw new Error("Wave x coordinates must increase");
    return (p.y - points[i].y) / width;
  });
  const tangents = points.map((_, i) =>
    i === 0
      ? slopes[0]
      : i === points.length - 1
        ? slopes[i - 1]
        : slopes[i - 1] * slopes[i] <= 0
          ? 0
          : (slopes[i - 1] + slopes[i]) / 2,
  );
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    const a = tangents[i] / slope,
      b = tangents[i + 1] / slope;
    const length = Math.hypot(a, b);
    if (length > 3) {
      tangents[i] = ((3 * a) / length) * slope;
      tangents[i + 1] = ((3 * b) / length) * slope;
    }
  });
  return slopes.map((_, i) => {
    const start = points[i],
      end = points[i + 1],
      third = (end.x - start.x) / 3;
    return {
      start,
      end,
      c1: { x: start.x + third, y: start.y + tangents[i] * third },
      c2: { x: end.x - third, y: end.y - tangents[i + 1] * third },
    };
  });
}
export function monotonePath(points: WavePoint[]) {
  if (!points.length) return "";
  const segments = monotoneSegments(points);
  return (
    `M ${points[0].x} ${points[0].y}` +
    segments
      .map(
        (s) =>
          ` C ${s.c1.x} ${s.c1.y}, ${s.c2.x} ${s.c2.y}, ${s.end.x} ${s.end.y}`,
      )
      .join("")
  );
}
export function integerWaveTicks(max: number) {
  if (!Number.isFinite(max) || max < 0)
    throw new Error("Wave maximum must be nonnegative and finite");
  const target = Math.max(1, max / 4);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((n) => n * magnitude >= target)! * magnitude;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return {
    top,
    ticks: Array.from(
      { length: Math.round(top / step) + 1 },
      (_, i) => i * step,
    ),
  };
}
