import { useState } from "react";
import type { HealthSign } from "../domain/types";
import { TEMP_MAX, TEMP_MIN, type CheckInput } from "../domain/rules";
import { fromLocalInput, toLocalInput } from "./format";

interface Props {
  /** 表单标题前缀 */
  title: string;
  /** 默认时间（一般是当前时间或原检疫时间） */
  defaultTime: number;
  /** 更正模式时回填旧值 */
  initial?: Partial<{
    cageNo: string;
    temperature: number;
    respiratory: HealthSign;
    feces: HealthSign;
    cageCondition: HealthSign;
    note: string;
  }>;
  /** 是否需要运输笼字段（复检不需要） */
  requireCage?: boolean;
  submitLabel: string;
  onSubmit: (input: CheckInput, reason: string) => { ok: boolean; error?: string };
  /** 更正模式额外需要的“更正原因”输入 */
  requireReason?: boolean;
}

const SIGN_OPTIONS: { value: HealthSign; label: string }[] = [
  { value: "normal", label: "正常" },
  { value: "abnormal", label: "异常" },
];

export function QuarantineForm({
  title,
  defaultTime,
  initial,
  requireCage = true,
  submitLabel,
  onSubmit,
  requireReason = false,
}: Props) {
  const [cageNo, setCageNo] = useState(initial?.cageNo ?? "");
  const [temperature, setTemperature] = useState(
    initial?.temperature !== undefined ? String(initial.temperature) : ""
  );
  const [respiratory, setRespiratory] = useState<HealthSign | "">(initial?.respiratory ?? "");
  const [feces, setFeces] = useState<HealthSign | "">(initial?.feces ?? "");
  const [cageCondition, setCageCondition] = useState<HealthSign | "">(
    initial?.cageCondition ?? ""
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [checkTime, setCheckTime] = useState(toLocalInput(defaultTime));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (requireReason && !reason.trim()) {
      setError("更正必须填写原因，缺项不能保存");
      return;
    }
    const result = onSubmit(
      {
        cageNo,
        temperature: temperature.trim() === "" ? "" : Number(temperature),
        respiratory,
        feces,
        cageCondition,
        note,
        checkTime: fromLocalInput(checkTime),
      },
      reason
    );
    if (!result.ok) {
      setError(result.error ?? "保存失败");
      return;
    }
    setError(null);
    if (requireReason) setReason("");
  };

  return (
    <div className="qform">
      <h4>{title}</h4>
      <div className="qform-grid">
        {requireCage && (
          <label>
            <span>运输笼编号 *</span>
            <input value={cageNo} onChange={(e) => setCageNo(e.target.value)} placeholder="如 A1" />
          </label>
        )}
        <label>
          <span>体温（℃）* 正常 {TEMP_MIN.toFixed(1)}~{TEMP_MAX.toFixed(1)}</span>
          <input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            inputMode="decimal"
            placeholder="如 41.2"
          />
        </label>
        <SignField label="呼吸道 *" value={respiratory} onChange={setRespiratory} />
        <SignField label="粪便 *" value={feces} onChange={setFeces} />
        <SignField label="运输笼状况 *" value={cageCondition} onChange={setCageCondition} />
        <label className="wide">
          <span>备注</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填" />
        </label>
        <label>
          <span>检疫时间 *</span>
          <input type="datetime-local" value={checkTime} onChange={(e) => setCheckTime(e.target.value)} />
        </label>
        {requireReason && (
          <label className="wide">
            <span>更正原因 *（旧结论自动留痕）</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：体温计故障，复核后更正" />
          </label>
        )}
      </div>
      <p className="qform-hint">四项全部填写且时间有效才能保存；任一指标异常只能转隔离。</p>
      {error && <p className="form-error">⚠ {error}</p>}
      <button className="primary" onClick={submit}>
        {submitLabel}
      </button>
    </div>
  );
}

function SignField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HealthSign | "";
  onChange: (v: HealthSign) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="seg">
        {SIGN_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? `seg-btn active ${opt.value}` : "seg-btn"}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </label>
  );
}
