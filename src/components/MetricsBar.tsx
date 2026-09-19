// 鸽棚总览指标：归巢率 / 平均速度 / 未归巢 均排除隔离鸽，另设隔离·观察指标。

import { useMemo } from "react";
import type { LoftState } from "../domain/types";
import { computeMetrics } from "../domain/rules";

export function MetricsBar({ state }: { state: LoftState }) {
  const metrics = useMemo(() => computeMetrics(state), [state]);

  const items: { label: string; value: string; tone: "blue" | "grey" | "orange" | "red" }[] = [
    {
      label: "归巢率（不含隔离鸽）",
      value: metrics.homeRate === null ? "—" : `${metrics.homeRate}%`,
      tone: "blue",
    },
    {
      label: "平均速度",
      value: metrics.avgSpeed === null ? "—" : `${metrics.avgSpeed} m/min`,
      tone: "grey",
    },
    {
      label: "未归巢",
      value: `${metrics.unreturned.length} 羽次`,
      tone: "orange",
    },
    {
      label: "隔离 / 观察",
      value: `${metrics.isolatedCount} / ${metrics.observingCount} 羽`,
      tone: "red",
    },
  ];

  return (
    <section className="metrics">
      {items.map((item) => (
        <article key={item.label} className={`metric-${item.tone}`}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}
