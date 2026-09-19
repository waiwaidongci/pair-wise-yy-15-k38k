import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { abnormalReasons, isAbnormal } from "../domain/rules";
import { fmtCountdown, fmtDateTime, statusTitle } from "./format";
import { Panel, StatusBadge } from "./components";

export function ArchiveTab() {
  const { db, now, statuses } = useStore();
  const [selected, setSelected] = useState<string>(db.pigeons[0]?.id ?? "");
  const [bloodline, setBloodline] = useState("all");

  const bloodlines = useMemo(
    () => Array.from(new Set(db.pigeons.map((p) => p.bloodline))).sort(),
    [db.pigeons]
  );
  const list = db.pigeons.filter((p) => bloodline === "all" || p.bloodline === bloodline);
  const pigeon = db.pigeons.find((p) => p.id === selected) ?? list[0];

  if (!pigeon) return <Panel title="单羽档案" hint="暂无鸽只" />;

  const info = statuses.get(pigeon.id)!;
  const entries = db.entries
    .filter((e) => e.pigeonId === pigeon.id)
    .map((e) => ({ entry: e, session: db.sessions.find((s) => s.id === e.sessionId)! }))
    .sort((a, b) => b.session.releaseTime - a.session.releaseTime);
  const checks = db.checks.filter((c) => c.pigeonId === pigeon.id).sort((a, b) => b.checkTime - a.checkTime);
  const rechecks = db.rechecks.filter((r) => r.pigeonId === pigeon.id).sort((a, b) => a.checkTime - b.checkTime);

  const totalReturned = entries.filter((x) => x.entry.returned).length;

  return (
    <div className="archive">
      <aside className="panel archive-list">
        <label className="inline-select">
          <span>血统筛选</span>
          <select value={bloodline} onChange={(e) => setBloodline(e.target.value)}>
            <option value="all">全部血统</option>
            {bloodlines.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        {list.map((p) => (
          <button
            key={p.id}
            className={p.id === pigeon.id ? "archive-item active" : "archive-item"}
            onClick={() => setSelected(p.id)}
          >
            <span className="mono">{p.ringNo}</span>
            <StatusBadge status={statuses.get(p.id)!.status} />
          </button>
        ))}
      </aside>

      <div className="tab-grid archive-main">
        <Panel title={`${pigeon.ringNo} · 单羽档案`} hint={`${pigeon.bloodline} · ${pigeon.role} · ${pigeon.gender}`}>
          <div className="archive-head">
            <StatusBadge status={info.status} />
            <p className="reason">{statusTitle(db, info, now)}</p>
            {info.status === "isolated" && (
              <p className="line">
                距恢复：{fmtCountdown((info.recoverableAt ?? now) - now)} · 开始于{" "}
                {fmtDateTime(info.isolatedAt!)}
              </p>
            )}
            {pigeon.pairingNote && <p className="line">配对备注：{pigeon.pairingNote}</p>}
            <p className="line">
              历史参赛 {entries.length} 次，归巢 {totalReturned} 次
              {info.status === "isolated" ? "（当前隔离，成绩暂不计入排行）" : ""}
            </p>
          </div>
        </Panel>

        <Panel title="训放历史成绩" hint="按时间倒序，原记录始终保留">
          <table className="table">
            <thead>
              <tr>
                <th>训放</th>
                <th>距离</th>
                <th>天气</th>
                <th>放飞</th>
                <th>归巢</th>
                <th>速度</th>
                <th>运输笼</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ entry, session }) => (
                <tr key={entry.id} className={entry.returned ? "" : "row-pending"}>
                  <td>{session.location}</td>
                  <td>{session.distanceKm}km</td>
                  <td>{session.weather}</td>
                  <td>{fmtDateTime(session.releaseTime)}</td>
                  <td>{entry.returned ? fmtDateTime(entry.returnTime!) : <span className="text-danger">未归巢</span>}</td>
                  <td>{entry.speedMpm ? `${entry.speedMpm} m/min` : "—"}</td>
                  <td>{entry.cageNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="检疫 / 复检 / 更正记录" hint="更正留痕全部可查">
          <div className="timeline">
            {checks.map((check) => {
              const session = db.sessions.find((s) => s.id === check.sessionId)!;
              const related = rechecks.filter((r) => r.checkId === check.id);
              return (
                <div key={check.id} className={`timeline-item ${isAbnormal(check) ? "bad" : "good"}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <h4>
                      回棚检疫 · {session.location}（{fmtDateTime(check.checkTime)}）
                      <span className={isAbnormal(check) ? "text-danger" : "text-ok"}>
                        {isAbnormal(check) ? ` 异常：${abnormalReasons(check).join("、")}` : " 四项正常"}
                      </span>
                    </h4>
                    <p>
                      体温 {check.temperature.toFixed(1)}℃ · 呼吸道 {zh(check.respiratory)} · 粪便{" "}
                      {zh(check.feces)} · 运输笼 {zh(check.cageCondition)} · 笼 {check.cageNo}
                      {check.note ? ` · ${check.note}` : ""}
                    </p>
                    {check.revisions.map((rev, i) => (
                      <div key={i} className="revision-item">
                        <p className="text-warn">
                          旧结论（{fmtDateTime(rev.revisedAt)} 更正，原因：{rev.reason}）
                        </p>
                        <p className="muted">
                          当时记录：体温 {rev.snapshot.temperature.toFixed(1)}℃ · 呼吸道{" "}
                          {zh(rev.snapshot.respiratory)} · 粪便 {zh(rev.snapshot.feces)} · 运输笼{" "}
                          {zh(rev.snapshot.cageCondition)} · 笼 {rev.snapshot.cageNo}
                          {rev.snapshot.note ? ` · ${rev.snapshot.note}` : ""}
                        </p>
                      </div>
                    ))}
                    {related.map((r) => (
                      <div key={r.id} className={`recheck ${isAbnormal(r) ? "bad" : "good"}`}>
                        复检（{fmtDateTime(r.checkTime)}）：体温 {r.temperature.toFixed(1)}℃ · 呼吸道{" "}
                        {zh(r.respiratory)} · 粪便 {zh(r.feces)} · 运输笼 {zh(r.cageCondition)}
                        {isAbnormal(r) ? " · 异常，隔离重新计时" : " · 四项正常"}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {checks.length === 0 && <p className="empty">尚无检疫记录</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function zh(v: "normal" | "abnormal") {
  return v === "normal" ? "正常" : "异常";
}
