// 单羽档案：状态、成绩、训放历史与检疫全历史（含被更正的旧结论）。
// 全部由 buildProfile 推导，更正检疫后自动同步重算。

import { useMemo } from "react";
import type { LoftState } from "../domain/types";
import { buildProfile } from "../domain/rules";
import { fmtDateTime, fmtFull, StatusBadge } from "./ui";

interface ProfilePanelProps {
  state: LoftState;
  ring: string | null;
}

export function ProfilePanel({ state, ring }: ProfilePanelProps) {
  const profile = useMemo(() => (ring ? buildProfile(state, ring) : null), [state, ring]);

  if (!profile) {
    return (
      <section className="panel">
        <div className="heading">
          <div>
            <p>单羽档案</p>
            <h2>未选择</h2>
          </div>
        </div>
        <p className="empty">在「鸽棚总览」中点击一羽鸽子查看档案。</p>
      </section>
    );
  }

  const { pigeon, status, flights, returns, homeRate, bestSpeed, trainings, quarantineHistory } =
    profile;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>单羽档案</p>
          <h2>{pigeon.ring}</h2>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="profile-meta">
        <span>血统：{pigeon.bloodline}</span>
        <span>类别：{pigeon.role}</span>
        {status.kind === "隔离中" && <span>隔离起始：{fmtFull(status.since)}</span>}
        {status.kind === "观察中" && (
          <span>
            观察原因：同笼 {status.sourceRing} 隔离（笼号 {status.cageNo}）
          </span>
        )}
      </div>

      <div className="profile-stats">
        <div>
          <small>出赛</small>
          <strong>{flights}</strong>
        </div>
        <div>
          <small>归巢</small>
          <strong>{returns}</strong>
        </div>
        <div>
          <small>归巢率</small>
          <strong>{homeRate === null ? "—" : `${homeRate}%`}</strong>
        </div>
        <div>
          <small>最好分速</small>
          <strong>{bestSpeed === null ? "—" : `${Math.round(bestSpeed)}`}</strong>
        </div>
      </div>

      <h3 className="subheading">训放历史</h3>
      {trainings.length === 0 ? (
        <p className="empty">暂无训放记录。</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>地点</th>
              <th>距离</th>
              <th>天气</th>
              <th>放飞</th>
              <th>归巢</th>
              <th>分速</th>
            </tr>
          </thead>
          <tbody>
            {trainings.map((t) => (
              <tr key={t.id}>
                <td>{t.location}</td>
                <td>{t.distanceKm}km</td>
                <td>{t.weather}</td>
                <td>{fmtDateTime(t.releasedAt)}</td>
                <td>{t.returnedAt ? fmtDateTime(t.returnedAt) : "未归巢"}</td>
                <td>{t.speedMpm === null ? "—" : `${Math.round(t.speedMpm)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="subheading">检疫历史（含旧结论）</h3>
      {quarantineHistory.length === 0 ? (
        <p className="empty">暂无检疫记录。</p>
      ) : (
        <ol className="timeline">
          {quarantineHistory.map((q) => {
            const superseded = q.supersededBy !== null;
            return (
              <li key={q.id} className={superseded ? "timeline-old" : ""}>
                <div className="timeline-head">
                  <b>
                    {q.kind} · 第 {q.revision} 版
                  </b>
                  <span className={`badge ${q.outcome === "转隔离" ? "badge-danger" : "badge-ok"}`}>
                    {q.outcome}
                  </span>
                  {superseded ? (
                    <span className="badge badge-muted">旧结论 · 已被 {q.supersededBy} 更正</span>
                  ) : (
                    <span className="badge badge-info">当前有效</span>
                  )}
                </div>
                <p className="muted small">
                  {fmtFull(q.recordedAt)} · 笼号 {q.cageNo} · 体温 {q.temperatureC}℃ · 呼吸道
                  {q.respiratory} · 粪便{q.feces}
                  {q.abnormalItems.length > 0 && ` · 异常项：${q.abnormalItems.join("、")}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
