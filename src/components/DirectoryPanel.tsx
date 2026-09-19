// 鸽棚总览：按血统 / 状态筛选，点击行打开单羽档案。

import { useMemo, useState } from "react";
import type { LoftState } from "../domain/types";
import { deriveStatuses, type PigeonStatus } from "../domain/rules";
import { StatusBadge } from "./ui";

interface DirectoryPanelProps {
  state: LoftState;
  selectedRing: string | null;
  onSelect: (ring: string) => void;
}

type StatusFilter = "全部" | PigeonStatus["kind"];

export function DirectoryPanel({ state, selectedRing, onSelect }: DirectoryPanelProps) {
  const [bloodline, setBloodline] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部");

  const statuses = useMemo(() => deriveStatuses(state), [state]);
  const bloodlines = useMemo(
    () => Array.from(new Set(state.pigeons.map((p) => p.bloodline))),
    [state.pigeons],
  );

  const rows = state.pigeons.filter((p) => {
    if (bloodline && p.bloodline !== bloodline) return false;
    const st = statuses.get(p.ring)?.kind ?? "正常";
    if (statusFilter !== "全部" && st !== statusFilter) return false;
    return true;
  });

  const statsOf = (ring: string) => {
    const list = state.trainings.filter((t) => t.ring === ring);
    const returned = list.filter((t) => t.returnedAt !== null);
    return { flights: list.length, returns: returned.length };
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>鸽棚总览</p>
          <h2>在册 {state.pigeons.length} 羽</h2>
        </div>
      </div>

      <div className="chips filter-row">
        <button className={bloodline === null ? "chip-active" : ""} onClick={() => setBloodline(null)}>
          全部血统
        </button>
        {bloodlines.map((b) => (
          <button key={b} className={bloodline === b ? "chip-active" : ""} onClick={() => setBloodline(b)}>
            {b}
          </button>
        ))}
        <span className="chip-divider" />
        {(["全部", "正常", "观察中", "隔离中"] as StatusFilter[]).map((s) => (
          <button key={s} className={statusFilter === s ? "chip-active" : ""} onClick={() => setStatusFilter(s)}>
            {s}
          </button>
        ))}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>足环号</th>
            <th>血统</th>
            <th>类别</th>
            <th>状态</th>
            <th>出赛 / 归巢</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const st = statuses.get(p.ring) ?? { kind: "正常" as const };
            const s = statsOf(p.ring);
            return (
              <tr
                key={p.ring}
                className={selectedRing === p.ring ? "row-selected" : "row-clickable"}
                onClick={() => onSelect(p.ring)}
              >
                <td>{p.ring}</td>
                <td>{p.bloodline}</td>
                <td>{p.role}</td>
                <td>
                  <StatusBadge status={st} />
                </td>
                <td>
                  {s.flights} / {s.returns}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">当前筛选条件下没有鸽子。</p>}
    </section>
  );
}
