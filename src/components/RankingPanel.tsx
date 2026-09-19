// 训放成绩排行：隔离鸽退出排行，观察鸽保留并标注。
// 数据完全由 buildRanking 从状态推导，更正检疫后自动重算。

import { useMemo, useState } from "react";
import type { LoftState } from "../domain/types";
import {
  buildRanking,
  deriveStatuses,
  type DistanceClass,
} from "../domain/rules";

const DISTANCE_CLASSES: DistanceClass[] = ["全部", "短距离", "中距离", "长距离"];

export function RankingPanel({ state }: { state: LoftState }) {
  const [distanceClass, setDistanceClass] = useState<DistanceClass>("全部");
  const [bloodline, setBloodline] = useState<string | null>(null);
  const [role, setRole] = useState<"全部" | "赛鸽" | "种鸽">("全部");

  const bloodlines = useMemo(
    () => Array.from(new Set(state.pigeons.map((p) => p.bloodline))),
    [state.pigeons],
  );
  const entries = useMemo(
    () => buildRanking(state, { bloodline, distanceClass, role }),
    [state, bloodline, distanceClass, role],
  );
  const statuses = useMemo(() => deriveStatuses(state), [state]);
  const isolatedCount = state.pigeons.filter(
    (p) => statuses.get(p.ring)?.kind === "隔离中",
  ).length;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>成绩排行</p>
          <h2>训放成绩排行</h2>
        </div>
        <span className="heading-meta">
          {isolatedCount > 0 ? `${isolatedCount} 羽隔离中，已退出排行` : "全员参与排行"}
        </span>
      </div>

      <div className="chips filter-row">
        {DISTANCE_CLASSES.map((c) => (
          <button
            key={c}
            className={distanceClass === c ? "chip-active" : ""}
            onClick={() => setDistanceClass(c)}
          >
            {c}
          </button>
        ))}
        <span className="chip-divider" />
        {(["全部", "赛鸽", "种鸽"] as const).map((r) => (
          <button key={r} className={role === r ? "chip-active" : ""} onClick={() => setRole(r)}>
            {r}
          </button>
        ))}
        <span className="chip-divider" />
        <button className={bloodline === null ? "chip-active" : ""} onClick={() => setBloodline(null)}>
          全部血统
        </button>
        {bloodlines.map((b) => (
          <button
            key={b}
            className={bloodline === b ? "chip-active" : ""}
            onClick={() => setBloodline(b)}
          >
            {b}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="empty">当前筛选条件下暂无归巢成绩。</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>名次</th>
              <th>足环号</th>
              <th>血统</th>
              <th>归巢羽次</th>
              <th>最好分速</th>
              <th>平均分速</th>
              <th>最远距离</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.ring}>
                <td>
                  <b className="rank-no">{i + 1}</b>
                </td>
                <td>{e.ring}</td>
                <td>{e.bloodline}</td>
                <td>{e.flights}</td>
                <td>{Math.round(e.bestSpeed)} m/min</td>
                <td>{Math.round(e.avgSpeed)} m/min</td>
                <td>{e.bestDistanceKm} km</td>
                <td>
                  {e.status === "观察中" ? (
                    <span className="badge badge-warn">观察中</span>
                  ) : (
                    <span className="badge badge-ok">正常</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
