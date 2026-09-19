// 隔离与观察面板：
// - 隔离鸽：显示隔离时长 / 剩余时间，登记复检，满 48h 且复检正常才可解除
// - 观察鸽：同笼转入，保留原记录，随隔离解除自动结束

import { useMemo, useState } from "react";
import type { LoftState } from "../domain/types";
import {
  checkRecovery,
  deriveStatuses,
  formatHours,
  ISOLATION_HOURS,
  latestAdmission,
  type QuarantineDraft,
} from "../domain/rules";
import type { ActionResult } from "../data/useLoft";
import { QuarantineForm } from "./QuarantineForm";
import { fmtFull, Notice } from "./ui";

interface IsolationPanelProps {
  state: LoftState;
  now: Date;
  onRecheck: (draft: QuarantineDraft) => ActionResult;
  onRelease: (ring: string) => ActionResult;
}

export function IsolationPanel({ state, now, onRecheck, onRelease }: IsolationPanelProps) {
  const statuses = useMemo(() => deriveStatuses(state), [state]);
  const [recheckingRing, setRecheckingRing] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);

  const isolated = state.pigeons.filter((p) => statuses.get(p.ring)?.kind === "隔离中");
  const observing = state.pigeons.filter((p) => statuses.get(p.ring)?.kind === "观察中");

  const release = (ring: string) => {
    const res = onRelease(ring);
    setMessage(res);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>检疫准入</p>
          <h2>隔离与观察</h2>
        </div>
        <span className="heading-meta">
          隔离 {isolated.length} 羽 · 观察 {observing.length} 羽
        </span>
      </div>

      <Notice result={message} />

      {isolated.length === 0 && observing.length === 0 && (
        <p className="empty">当前无隔离或观察中的鸽子。</p>
      )}

      <div className="stack">
        {isolated.map((p) => {
          const recovery = checkRecovery(state, p.ring, now);
          if (!recovery) return null;
          const progress = Math.min(100, (recovery.elapsedHours / ISOLATION_HOURS) * 100);
          const cageNo = latestAdmission(state, p.ring)?.cageNo ?? "";
          return (
            <article key={p.ring} className="iso-card">
              <header>
                <div>
                  <h3>{p.ring}</h3>
                  <p className="muted">
                    {p.bloodline} · 笼号 {cageNo || "—"} · 自 {fmtFull(recovery.since)} 隔离
                  </p>
                </div>
                <span className="badge badge-danger">隔离中</span>
              </header>

              <div className="progress">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="muted small">
                已隔离 {formatHours(recovery.elapsedHours)}
                {recovery.remainingHours > 0
                  ? `，距 ${ISOLATION_HOURS} 小时还差 ${formatHours(recovery.remainingHours)}`
                  : `，已满 ${ISOLATION_HOURS} 小时`}
                {recovery.lastRecheck
                  ? recovery.lastRecheck.abnormalItems.length === 0
                    ? "；最近复检正常"
                    : `；最近复检异常（${recovery.lastRecheck.abnormalItems.join("、")}）`
                  : "；尚未复检"}
              </p>

              {recovery.reasons.length > 0 && (
                <ul className="reason-list">
                  {recovery.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              <div className="form-actions">
                <button
                  className="primary"
                  disabled={!recovery.ok}
                  title={recovery.ok ? "解除隔离" : recovery.reasons.join("；")}
                  onClick={() => release(p.ring)}
                >
                  解除隔离
                </button>
                <button
                  className="ghost"
                  onClick={() => setRecheckingRing(recheckingRing === p.ring ? null : p.ring)}
                >
                  {recheckingRing === p.ring ? "收起复检" : "登记复检"}
                </button>
              </div>

              {recheckingRing === p.ring && (
                <QuarantineForm
                  state={state}
                  kind="复检"
                  lockRing={p.ring}
                  defaultCageNo={cageNo}
                  submitLabel="保存复检"
                  onSubmit={(draft) => {
                    const res = onRecheck(draft);
                    if (res.ok) setRecheckingRing(null);
                    return res;
                  }}
                  onCancel={() => setRecheckingRing(null)}
                />
              )}
            </article>
          );
        })}

        {observing.map((p) => {
          const st = statuses.get(p.ring);
          if (!st || st.kind !== "观察中") return null;
          return (
            <article key={p.ring} className="iso-card iso-watch">
              <header>
                <div>
                  <h3>{p.ring}</h3>
                  <p className="muted">
                    {p.bloodline} · 与 {st.sourceRing} 同笼（{st.cageNo}），自 {fmtFull(st.since)} 观察
                  </p>
                </div>
                <span className="badge badge-warn">观察中</span>
              </header>
              <p className="muted small">原成绩与归巢记录保留，继续参与排行与统计；同笼隔离解除后自动结束观察。</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
