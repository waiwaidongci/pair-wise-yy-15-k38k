import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { computeRankings, type DistanceCategory } from "../domain/rules";
import { EmptyState, Panel, StatusBadge } from "./components";

const DISTANCE_TABS: { key: DistanceCategory; label: string }[] = [
  { key: "all", label: "全部距离" },
  { key: "short", label: "短距离（<150km）" },
  { key: "middle", label: "中距离（150–400km）" },
  { key: "long", label: "长距离（>400km）" },
];

export function RankingTab() {
  const { db, statuses } = useStore();
  const [distance, setDistance] = useState<DistanceCategory>("all");
  const [bloodline, setBloodline] = useState<string>("all");

  const bloodlines = useMemo(
    () => Array.from(new Set(db.pigeons.map((p) => p.bloodline))).sort(),
    [db.pigeons]
  );

  const { rows, excluded } = useMemo(
    () => computeRankings(db, statuses, { distance, bloodline }),
    [db, statuses, distance, bloodline]
  );

  const shown = rows.filter((r) => r.entries > 0);
  const idle = rows.filter((r) => r.entries === 0);

  return (
    <div className="tab-grid">
      <Panel
        title="训放成绩排行"
        hint="隔离鸽退出归巢率与排行；同笼观察鸽保留原记录"
        actions={
          <label className="inline-select">
            <span>血统</span>
            <select value={bloodline} onChange={(e) => setBloodline(e.target.value)}>
              <option value="all">全部血统</option>
              {bloodlines.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="chips filter-chips">
          {DISTANCE_TABS.map((t) => (
            <button
              key={t.key}
              className={distance === t.key ? "chip active" : "chip"}
              onClick={() => setDistance(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState text="该筛选条件下暂无成绩" />
        ) : (
          <table className="table ranking">
            <thead>
              <tr>
                <th>名次</th>
                <th>足环号</th>
                <th>血统</th>
                <th>状态</th>
                <th>参赛</th>
                <th>归巢</th>
                <th>归巢率</th>
                <th>平均速度 m/min</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={row.pigeon.id} className={i < 3 ? "top" : ""}>
                  <td className="rank-no">{i + 1}</td>
                  <td className="mono">{row.pigeon.ringNo}</td>
                  <td>{row.pigeon.bloodline}</td>
                  <td>
                    <StatusBadge status={statuses.get(row.pigeon.id)!.status} />
                  </td>
                  <td>{row.entries}</td>
                  <td>{row.returned}</td>
                  <td>{(row.homingRate * 100).toFixed(0)}%</td>
                  <td>{row.avgSpeed ?? "—"}</td>
                </tr>
              ))}
              {idle.map((row) => (
                <tr key={row.pigeon.id} className="idle-row">
                  <td>—</td>
                  <td className="mono">{row.pigeon.ringNo}</td>
                  <td>{row.pigeon.bloodline}</td>
                  <td>
                    <StatusBadge status={statuses.get(row.pigeon.id)!.status} />
                  </td>
                  <td>0</td>
                  <td>0</td>
                  <td>—</td>
                  <td>未参赛</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="本期退出排行（隔离中）" hint="原记录仍可在单羽档案查看，恢复后自动重新参与">
        {excluded.length === 0 ? (
          <EmptyState text="没有因隔离退出排行的赛鸽" />
        ) : (
          <ul className="exclude-list">
            {excluded.map((p) => {
              const mine = db.entries.filter((e) => e.pigeonId === p.id);
              const returned = mine.filter((e) => e.returned).length;
              return (
                <li key={p.id}>
                  <StatusBadge status="isolated" />
                  <span className="mono">{p.ringNo}</span>
                  <span>{p.bloodline}</span>
                  <span className="muted">
                    历史参赛 {mine.length} 次 / 归巢 {returned} 次（本期不计）
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
