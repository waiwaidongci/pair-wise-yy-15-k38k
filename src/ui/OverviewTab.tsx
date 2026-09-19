import { useStore } from "../state/store";
import { computeOverview, computeUnreturned, releaseBlocker } from "../domain/rules";
import {
  fmtCountdown,
  fmtDateTime,
  fmtElapsed,
  statusTitle,
} from "./format";
import { EmptyState, Panel, StatusBadge } from "./components";

export function OverviewTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { db, now, statuses } = useStore();
  const metrics = computeOverview(db, statuses);
  const unreturned = computeUnreturned(db, statuses, now);
  const isolated = db.pigeons.filter((p) => statuses.get(p.id)?.status === "isolated");
  const observation = db.pigeons.filter(
    (p) => statuses.get(p.id)?.status === "observation"
  );

  return (
    <div className="tab-grid">
      <section className="metrics">
        <MetricCard label="在棚鸽总数" value={String(metrics.totalPigeons)} />
        <MetricCard label="归巢率（隔离鸽退出）" value={`${(metrics.homingRate * 100).toFixed(1)}%`} tone="primary" />
        <MetricCard label="平均速度" value={metrics.avgSpeed ? `${metrics.avgSpeed} m/min` : "—"} />
        <MetricCard label="未归巢" value={String(metrics.unreturned)} tone="accent" />
        <MetricCard label="隔离中" value={String(metrics.isolated)} tone="danger" />
        <MetricCard label="观察中" value={String(metrics.observation)} tone="warn" />
      </section>

      <Panel title="隔离鸽动态" hint="回棚检疫异常 · 满48小时且复检正常才恢复">
        {isolated.length === 0 ? (
          <EmptyState text="当前没有隔离鸽" />
        ) : (
          <div className="cards">
            {isolated.map((p) => {
              const info = statuses.get(p.id)!;
              const remain = (info.recoverableAt ?? now) - now;
              const satisfied = now >= (info.recoverableAt ?? now);
              return (
                <article key={p.id} className="bird-card danger">
                  <header>
                    <div>
                      <h3>{p.ringNo}</h3>
                      <p>{p.bloodline}</p>
                    </div>
                    <StatusBadge status="isolated" />
                  </header>
                  <p className="reason">{statusTitle(db, info, now)}</p>
                  <div className="progress">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${Math.min(100, ((48 * 3600_000 - Math.max(0, remain)) / (48 * 3600_000)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="line">
                    隔离开始 {fmtDateTime(info.isolatedAt!)} ·{" "}
                    {satisfied ? "已满48小时" : `距恢复 ${fmtCountdown(remain)}`}
                  </p>
                  <p className="line">
                    已有复检 {info.rechecks.filter((r) => r.checkTime >= (info.isolatedAt ?? 0)).length} 次
                    {satisfied ? "，请立即复检；四项正常即恢复" : ""}
                  </p>
                  <p className="block-note">⛔ {releaseBlocker(info, now).warning}</p>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="同笼观察鸽" hint="原记录保留，复检正常即可解除">
        {observation.length === 0 ? (
          <EmptyState text="当前没有观察鸽" />
        ) : (
          <div className="cards">
            {observation.map((p) => {
              const info = statuses.get(p.id)!;
              const source = db.checks.find((c) => c.id === info.exposedBy?.checkId);
              return (
                <article key={p.id} className="bird-card warn">
                  <header>
                    <div>
                      <h3>{p.ringNo}</h3>
                      <p>{p.bloodline}</p>
                    </div>
                    <StatusBadge status="observation" />
                  </header>
                  <p className="reason">{statusTitle(db, info, now)}</p>
                  {source && <p className="line">接触发生于 {fmtDateTime(source.checkTime)}</p>}
                  <p className="line">成绩与排行记录保留，不强制退出训放</p>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="未归巢提醒"
        hint="训放后未完成回棚登记"
        actions={
          <button className="link-btn" onClick={() => onNavigate("checkin")}>
            去登记检疫 →
          </button>
        }
      >
        {unreturned.length === 0 ? (
          <EmptyState text="全部归巢，暂无未归巢鸽" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>足环号</th>
                <th>训放</th>
                <th>放飞时间</th>
                <th>已在外</th>
                <th>状态说明</th>
              </tr>
            </thead>
            <tbody>
              {unreturned.map((row) => (
                <tr key={row.entry.id}>
                  <td className="mono">{row.pigeon.ringNo}</td>
                  <td>
                    {row.location} {row.distanceKm}km
                  </td>
                  <td>{fmtDateTime(row.releaseTime)}</td>
                  <td>{fmtElapsed(now - row.releaseTime)}</td>
                  <td>
                    {row.blocked ? (
                      <span className="text-danger">⛔ {row.blockReason}</span>
                    ) : (
                      <span className="text-warn">等待归巢后登记回棚检疫</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "accent" | "danger" | "warn";
}) {
  return (
    <article className={`metric metric-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}
