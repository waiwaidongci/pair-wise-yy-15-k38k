// 未归巢提醒：隔离鸽的记录不计入提醒（与归巢率口径一致），单列展示。

import { useMemo, useState } from "react";
import type { LoftState } from "../domain/types";
import { computeMetrics, formatHours } from "../domain/rules";
import type { ActionResult } from "../data/useLoft";
import { fmtDateTime, Notice, toLocalInput } from "./ui";

interface AlertsPanelProps {
  state: LoftState;
  now: Date;
  onMarkReturned: (trainingId: string, returnedAt: string) => ActionResult;
}

export function AlertsPanel({ state, now, onMarkReturned }: AlertsPanelProps) {
  const metrics = useMemo(() => computeMetrics(state), [state]);
  const [returnAt, setReturnAt] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);

  const mark = (trainingId: string) => {
    const value = returnAt[trainingId] ?? toLocalInput(now);
    const res = onMarkReturned(trainingId, new Date(value).toISOString());
    setResult(res);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>未归巢提醒</p>
          <h2>待归巢 {metrics.unreturned.length} 羽次</h2>
        </div>
      </div>

      <Notice result={result} />

      {metrics.unreturned.length === 0 && metrics.unreturnedIsolated.length === 0 && (
        <p className="empty">全部训放批次均已归巢。</p>
      )}

      <div className="stack">
        {metrics.unreturned.map((t) => {
          const hours = (now.getTime() - Date.parse(t.releasedAt)) / 3600_000;
          return (
            <article key={t.id} className="alert-card">
              <div>
                <h3>{t.ring}</h3>
                <p className="muted">
                  {t.location} · {t.distanceKm}km · {t.weather} · 放飞 {fmtDateTime(t.releasedAt)}，
                  已放出 {formatHours(hours)}
                </p>
              </div>
              <div className="return-form">
                <input
                  type="datetime-local"
                  value={returnAt[t.id] ?? toLocalInput(now)}
                  onChange={(e) =>
                    setReturnAt((prev) => ({ ...prev, [t.id]: e.target.value }))
                  }
                />
                <button onClick={() => mark(t.id)}>登记归巢</button>
              </div>
            </article>
          );
        })}

        {metrics.unreturnedIsolated.map((t) => (
          <article key={t.id} className="alert-card alert-muted">
            <div>
              <h3>{t.ring}</h3>
              <p className="muted">
                {t.location} · {t.distanceKm}km · 放飞 {fmtDateTime(t.releasedAt)} ·
                该羽隔离中，不计入未归巢提醒与归巢率
              </p>
            </div>
            <span className="badge badge-danger">隔离中</span>
          </article>
        ))}
      </div>
    </section>
  );
}
