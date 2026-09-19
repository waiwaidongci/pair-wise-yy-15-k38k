import { useState } from "react";
import { useStore } from "../state/store";
import { distanceCategory, releaseBlocker } from "../domain/rules";
import { fmtDateTime, toLocalInput, fromLocalInput } from "./format";
import { EmptyState, Panel, StatusBadge } from "./components";

const DISTANCE_LABEL: Record<string, string> = {
  short: "短距离",
  middle: "中距离",
  long: "长距离",
};

export function ReleaseTab() {
  const { db, now, statuses, saveSession } = useStore();
  const [location, setLocation] = useState("");
  const [distance, setDistance] = useState("");
  const [weather, setWeather] = useState("");
  const [releaseTime, setReleaseTime] = useState(toLocalInput(now));
  const [cages, setCages] = useState<{ cageNo: string; ids: string[] }[]>([
    { cageNo: "A1", ids: [] },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const racers = db.pigeons.filter((p) => p.role !== "种鸽");

  const assignedIds = new Set(cages.flatMap((c) => c.ids));

  const submit = () => {
    setDone(null);
    const result = saveSession({
      location,
      distanceKm: Number(distance),
      weather,
      releaseTime: fromLocalInput(releaseTime),
      cages: cages.map((c) => ({ cageNo: c.cageNo, pigeonIds: c.ids })),
    });
    if (!result.ok) {
      setError(result.error ?? "创建失败");
      return;
    }
    setError(null);
    setDone(`已创建训放并登记 ${assignedIds.size} 羽上笼`);
    setLocation("");
    setDistance("");
    setWeather("");
    setCages([{ cageNo: "A1", ids: [] }]);
  };

  const togglePigeon = (row: number, pid: string) => {
    setCages((prev) =>
      prev.map((c, i) => {
        if (i !== row) return { ...c, ids: c.ids.filter((x) => x !== pid) };
        return c.ids.includes(pid)
          ? { ...c, ids: c.ids.filter((x) => x !== pid) }
          : { ...c, ids: [...c.ids, pid] };
      })
    );
  };

  return (
    <div className="tab-grid">
      <Panel title="新建训放 · 运输笼分配" hint="上笼准入">
        <div className="field-grid">
          <label>
            <span>训放地点 *</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如 濮阳" />
          </label>
          <label>
            <span>放飞距离 km *</span>
            <input value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="numeric" placeholder="如 300" />
          </label>
          <label>
            <span>天气</span>
            <input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="如 晴，北风3级" />
          </label>
          <label>
            <span>放飞时间 *</span>
            <input type="datetime-local" value={releaseTime} onChange={(e) => setReleaseTime(e.target.value)} />
          </label>
        </div>

        <div className="cage-editor">
          {cages.map((cage, row) => (
            <div key={row} className="cage-row">
              <div className="cage-head">
                <input
                  className="cage-no"
                  value={cage.cageNo}
                  onChange={(e) =>
                    setCages((prev) =>
                      prev.map((c, i) => (i === row ? { ...c, cageNo: e.target.value } : c))
                    )
                  }
                  placeholder="笼号"
                />
                <button
                  type="button"
                  onClick={() => setCages((prev) => prev.filter((_, i) => i !== row))}
                  disabled={cages.length === 1}
                >
                  删除笼
                </button>
              </div>
              <div className="pigeon-pick">
                {racers.map((p) => {
                  const selected = cage.ids.includes(p.id);
                  const usedElsewhere = assignedIds.has(p.id) && !selected;
                  const info = statuses.get(p.id)!;
                  const block = releaseBlocker(info, now);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={usedElsewhere}
                      title={block.warning}
                      className={[
                        "pick",
                        selected ? "selected" : "",
                        usedElsewhere ? "used" : "",
                        `pick-${info.status}`,
                      ].join(" ")}
                      onClick={() => togglePigeon(row, p.id)}
                    >
                      <span className="mono">{p.ringNo}</span>
                      <StatusBadge status={info.status} />
                      {block.blocked && <em className="pick-block">⛔ 禁止上笼</em>}
                    </button>
                  );
                })}
              </div>
              {cage.ids.some((id) => releaseBlocker(statuses.get(id)!, now).blocked) && (
                <p className="form-error">
                  该笼含隔离未恢复鸽，保存时会被整体拦截并说明原因
                </p>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setCages((prev) => [...prev, { cageNo: "", ids: [] }])}>
            + 增加运输笼
          </button>
        </div>

        <p className="qform-hint">
          隔离满48小时且复检正常才允许再次训放；观察鸽不强制拦截，会给出提示。种鸽不参与上笼。
        </p>
        {error && <p className="form-error">⛔ {error}</p>}
        {done && <p className="form-ok">✓ {done}</p>}
        <button className="primary" onClick={submit}>
          创建训放并登记上笼
        </button>
      </Panel>

      <Panel title="历史训放" hint="按放飞时间倒序">
        {db.sessions.length === 0 ? (
          <EmptyState text="还没有训放记录" />
        ) : (
          <div className="cards">
            {[...db.sessions]
              .sort((a, b) => b.releaseTime - a.releaseTime)
              .map((s) => {
                const entries = db.entries.filter((e) => e.sessionId === s.id);
                const returned = entries.filter((e) => e.returned).length;
                return (
                  <article key={s.id} className="session-card">
                    <header>
                      <div>
                        <h3>
                          {s.location} · {s.distanceKm}km
                          <span className="tag">{DISTANCE_LABEL[distanceCategory(s.distanceKm)]}</span>
                        </h3>
                        <p>{s.weather}</p>
                      </div>
                      <strong>
                        {returned}/{entries.length} 归巢
                      </strong>
                    </header>
                    <p className="line">放飞 {fmtDateTime(s.releaseTime)}</p>
                    <div className="cage-tags">
                      {Object.entries(s.cageAssignments).map(([cageNo, ids]) => (
                        <span key={cageNo} className="cage-tag">
                          {cageNo} · {ids.length}羽
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
          </div>
        )}
      </Panel>
    </div>
  );
}
