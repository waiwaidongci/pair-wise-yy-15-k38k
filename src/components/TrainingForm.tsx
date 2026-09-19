// 新增训放记录：提交前经过训放准入规则，
// 隔离未恢复的鸽子会被挡住并说明原因，不写入任何记录。

import { useMemo, useState } from "react";
import type { LoftState } from "../domain/types";
import { checkTrainAdmission, deriveStatuses } from "../domain/rules";
import type { ActionResult, TrainingDraft } from "../data/useLoft";
import { Notice, StatusBadge, toLocalInput } from "./ui";

interface TrainingFormProps {
  state: LoftState;
  now: Date;
  onSubmit: (draft: TrainingDraft) => ActionResult;
}

export function TrainingForm({ state, now, onSubmit }: TrainingFormProps) {
  const [ring, setRing] = useState(state.pigeons[0]?.ring ?? "");
  const [location, setLocation] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [weather, setWeather] = useState("");
  const [releasedAt, setReleasedAt] = useState(toLocalInput(now));
  const [returnedAt, setReturnedAt] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

  const statuses = useMemo(() => deriveStatuses(state), [state]);
  const currentStatus = statuses.get(ring) ?? { kind: "正常" as const };
  // 选中即预检，让拦截原因在提交前就可见
  const preview = useMemo(
    () => (ring ? checkTrainAdmission(state, ring, now) : null),
    [state, ring, now],
  );

  const submit = () => {
    const res = onSubmit({
      ring,
      location,
      distanceKm,
      weather,
      releasedAt: releasedAt ? new Date(releasedAt).toISOString() : "",
      returnedAt: returnedAt ? new Date(returnedAt).toISOString() : "",
    });
    setResult(res);
    if (res.ok) {
      setLocation("");
      setDistanceKm("");
      setWeather("");
      setReturnedAt("");
      setReleasedAt(toLocalInput(new Date()));
    }
  };

  return (
    <div>
      <div className="field-grid">
        <label>
          <span>足环号（当前状态：{currentStatus.kind}）</span>
          <select value={ring} onChange={(e) => setRing(e.target.value)}>
            {state.pigeons.map((p) => (
              <option key={p.ring} value={p.ring}>
                {p.ring}（{p.bloodline}）
              </option>
            ))}
          </select>
        </label>
        <div className="status-preview">
          <span>准入预检</span>
          <div>
            <StatusBadge status={currentStatus} />
            {preview && !preview.ok && <em className="blocked-text">将拦截</em>}
            {preview && preview.ok && preview.warning && (
              <em className="warn-text">观察期可放</em>
            )}
            {preview && preview.ok && !preview.warning && <em className="ok-text">可训放</em>}
          </div>
        </div>
        <label>
          <span>训放地点</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如 衡水湖北岸" />
        </label>
        <label>
          <span>放飞距离（km）</span>
          <input value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="如 80" inputMode="decimal" />
        </label>
        <label>
          <span>天气</span>
          <input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="如 晴 / 侧风" />
        </label>
        <label>
          <span>放飞时间</span>
          <input type="datetime-local" value={releasedAt} onChange={(e) => setReleasedAt(e.target.value)} />
        </label>
        <label>
          <span>归巢时间（未归巢留空）</span>
          <input type="datetime-local" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
        </label>
      </div>

      {preview && !preview.ok && <p className="notice notice-error">{preview.reason}</p>}
      {preview && preview.ok && preview.warning && (
        <p className="notice notice-warn">{preview.warning}</p>
      )}
      <Notice result={result} />

      <div className="form-actions">
        <button className="primary" onClick={submit}>
          保存训放记录
        </button>
      </div>
    </div>
  );
}
