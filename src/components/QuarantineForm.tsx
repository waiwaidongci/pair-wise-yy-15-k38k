// 回棚检疫登记表单：入棚检疫 / 复检 / 更正 三种模式复用。
// 规则（缺项不保存、任一异常只能转隔离）由 domain/rules 判定，这里只做展示与收集。

import { useMemo, useState } from "react";
import type { LoftState, QuarantineRecord } from "../domain/types";
import {
  findAbnormalItems,
  TEMP_NORMAL_MAX,
  TEMP_NORMAL_MIN,
  type QuarantineDraft,
} from "../domain/rules";
import type { ActionResult } from "../data/useLoft";
import { Notice, toLocalInput } from "./ui";

interface QuarantineFormProps {
  state: LoftState;
  kind: "入棚检疫" | "复检";
  lockRing?: string; // 复检 / 更正时锁定鸽子
  prefill?: QuarantineRecord; // 更正时预填旧值
  defaultCageNo?: string; // 复检时预填隔离笼号
  submitLabel: string;
  onSubmit: (draft: QuarantineDraft) => ActionResult;
  onCancel?: () => void;
}

export function QuarantineForm({
  state,
  kind,
  lockRing,
  prefill,
  defaultCageNo,
  submitLabel,
  onSubmit,
  onCancel,
}: QuarantineFormProps) {
  const [ring, setRing] = useState(lockRing ?? prefill?.ring ?? state.pigeons[0]?.ring ?? "");
  const [trainingId, setTrainingId] = useState<string>(prefill?.trainingId ?? "");
  const [cageNo, setCageNo] = useState(prefill?.cageNo ?? defaultCageNo ?? "");
  const [temperature, setTemperature] = useState(
    prefill ? String(prefill.temperatureC) : "",
  );
  const [respiratory, setRespiratory] = useState<"" | "正常" | "异常">(
    prefill?.respiratory ?? "",
  );
  const [feces, setFeces] = useState<"" | "正常" | "异常">(prefill?.feces ?? "");
  const [recordedAt, setRecordedAt] = useState(
    prefill ? toLocalInput(new Date(prefill.recordedAt)) : toLocalInput(new Date()),
  );
  const [result, setResult] = useState<ActionResult | null>(null);

  // 该羽最近的训放批次，便于关联归棚来源
  const ringTrainings = useMemo(
    () =>
      state.trainings
        .filter((t) => t.ring === ring)
        .sort((a, b) => Date.parse(b.releasedAt) - Date.parse(a.releasedAt))
        .slice(0, 8),
    [state.trainings, ring],
  );

  // 实时异常预判：任一异常 => 只能转隔离
  const previewAbnormal = useMemo(() => {
    const temp = Number(temperature);
    if (!temperature.trim() || !Number.isFinite(temp) || !respiratory || !feces) return null;
    return findAbnormalItems({
      temperatureC: temp,
      respiratory,
      feces,
    });
  }, [temperature, respiratory, feces]);

  const submit = () => {
    const draft: QuarantineDraft = {
      ring,
      trainingId: trainingId || null,
      kind,
      cageNo,
      temperature,
      respiratory,
      feces,
      recordedAt: recordedAt ? new Date(recordedAt).toISOString() : "",
    };
    const res = onSubmit(draft);
    setResult(res);
    if (res.ok && !prefill) {
      // 登记成功后清空检查项，保留下一羽连续登记的手感
      setTemperature("");
      setRespiratory("");
      setFeces("");
      setRecordedAt(toLocalInput(new Date()));
    }
  };

  return (
    <div className="quarantine-form">
      <div className="field-grid">
        <label>
          <span>足环号 *</span>
          <select value={ring} onChange={(e) => setRing(e.target.value)} disabled={!!lockRing}>
            {state.pigeons.map((p) => (
              <option key={p.ring} value={p.ring}>
                {p.ring}（{p.bloodline}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>关联训放批次</span>
          <select value={trainingId} onChange={(e) => setTrainingId(e.target.value)}>
            <option value="">不关联</option>
            {ringTrainings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.location} · {t.distanceKm}km
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>运输笼号 *</span>
          <input
            value={cageNo}
            onChange={(e) => setCageNo(e.target.value)}
            placeholder="如 C-07"
          />
        </label>
        <label>
          <span>体温（℃，正常 {TEMP_NORMAL_MIN}–{TEMP_NORMAL_MAX}）*</span>
          <input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="如 41.2"
            inputMode="decimal"
          />
        </label>
        <fieldset className="radio-group">
          <legend>呼吸道 *</legend>
          {(["正常", "异常"] as const).map((v) => (
            <label key={v} className="radio-inline">
              <input
                type="radio"
                name={`resp-${kind}-${prefill?.id ?? "new"}`}
                checked={respiratory === v}
                onChange={() => setRespiratory(v)}
              />
              {v}
            </label>
          ))}
        </fieldset>
        <fieldset className="radio-group">
          <legend>粪便 *</legend>
          {(["正常", "异常"] as const).map((v) => (
            <label key={v} className="radio-inline">
              <input
                type="radio"
                name={`feces-${kind}-${prefill?.id ?? "new"}`}
                checked={feces === v}
                onChange={() => setFeces(v)}
              />
              {v}
            </label>
          ))}
        </fieldset>
        <label>
          <span>登记时间 *</span>
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
          />
        </label>
      </div>

      {previewAbnormal !== null &&
        (previewAbnormal.length > 0 ? (
          <p className="notice notice-warn">
            检测到异常项：{previewAbnormal.join("、")}。按准入规则只能转隔离，保存后该羽进入隔离，
            同运输笼鸽转入观察（保留原成绩记录）。
          </p>
        ) : (
          <p className="notice notice-ok">四项均已登记且未见异常，保存后结论为「通过」。</p>
        ))}

      <Notice result={result} />

      <div className="form-actions">
        <button className="primary" onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="ghost">
            取消
          </button>
        )}
      </div>
    </div>
  );
}
