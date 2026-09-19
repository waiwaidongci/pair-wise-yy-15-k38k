// 检疫台账：全棚检疫记录一览。
// 有效记录可发起「更正」：旧记录保留可查，新记录作为当前结论，
// 排行、提醒、档案随之同步重算。

import { useMemo, useState } from "react";
import type { LoftState, QuarantineRecord } from "../domain/types";
import type { ActionResult } from "../data/useLoft";
import type { QuarantineDraft } from "../domain/rules";
import { QuarantineForm } from "./QuarantineForm";
import { fmtFull } from "./ui";

interface QuarantineLogProps {
  state: LoftState;
  onCorrect: (oldId: string, draft: QuarantineDraft) => ActionResult;
}

export function QuarantineLog({ state, onCorrect }: QuarantineLogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const records = useMemo(
    () =>
      [...state.quarantines].sort(
        (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
      ),
    [state.quarantines],
  );

  const editing: QuarantineRecord | null =
    records.find((r) => r.id === editingId) ?? null;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>检疫台账</p>
          <h2>全部检疫记录</h2>
        </div>
        <span className="heading-meta">
          有效 {records.filter((r) => r.supersededBy === null).length} 条 · 旧结论{" "}
          {records.filter((r) => r.supersededBy !== null).length} 条
        </span>
      </div>

      {records.length === 0 && <p className="empty">暂无检疫记录。</p>}

      <div className="records">
        {records.map((q) => {
          const superseded = q.supersededBy !== null;
          return (
            <article key={q.id} className={superseded ? "log-old" : ""}>
              <b className={q.outcome === "转隔离" ? "log-mark-danger" : "log-mark-ok"}>
                {q.kind === "复检" ? "检" : "疫"}
              </b>
              <div className="log-body">
                <h3>
                  {q.ring} · {q.kind} · 第 {q.revision} 版
                  <span className={`badge ${q.outcome === "转隔离" ? "badge-danger" : "badge-ok"}`}>
                    {q.outcome}
                  </span>
                  {superseded ? (
                    <span className="badge badge-muted">旧结论 · 已被 {q.supersededBy} 更正</span>
                  ) : (
                    <span className="badge badge-info">当前有效</span>
                  )}
                </h3>
                <p>
                  {fmtFull(q.recordedAt)} · 笼号 {q.cageNo} · 体温 {q.temperatureC}℃ · 呼吸道
                  {q.respiratory} · 粪便{q.feces}
                  {q.abnormalItems.length > 0 && ` · 异常项：${q.abnormalItems.join("、")}`}
                </p>
                {!superseded && (
                  <div className="form-actions">
                    <button
                      className="ghost"
                      onClick={() => setEditingId(editingId === q.id ? null : q.id)}
                    >
                      {editingId === q.id ? "收起更正" : "更正检疫"}
                    </button>
                  </div>
                )}
                {editing && editing.id === q.id && (
                  <QuarantineForm
                    state={state}
                    kind={q.kind}
                    lockRing={q.ring}
                    prefill={q}
                    submitLabel={`保存更正（第 ${q.revision + 1} 版）`}
                    onSubmit={(draft) => {
                      const res = onCorrect(q.id, draft);
                      if (res.ok) setEditingId(null);
                      return res;
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
