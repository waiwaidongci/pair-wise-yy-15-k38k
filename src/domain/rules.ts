// 状态规则层：纯函数，不依赖界面与持久化。
// 所有结论（状态、准入、排行、提醒）都由 LoftState 推导，
// 因此更正检疫后只要替换记录，各面板会自然同步重算。

import type {
  LoftState,
  Pigeon,
  QuarantineRecord,
  TrainingRecord,
} from "./types";

/** 鸽子正常体温区间（℃），超出即判异常 */
export const TEMP_NORMAL_MIN = 40.0;
export const TEMP_NORMAL_MAX = 42.5;

/** 体温录入的合理范围（℃），超出视为填写错误 */
export const TEMP_PLAUSIBLE_MIN = 35;
export const TEMP_PLAUSIBLE_MAX = 45;

/** 隔离时长要求：满 48 小时且复检正常才允许恢复 */
export const ISOLATION_HOURS = 48;

/** 同笼判定的时间窗：无关联训放批次时，登记时间相差 24h 内视为同批运输 */
const SAME_BATCH_WINDOW_MS = 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// 1. 登记校验：体温、呼吸道、粪便、运输笼 缺项不保存
// ---------------------------------------------------------------------------

export interface QuarantineDraft {
  ring: string;
  trainingId: string | null;
  kind: "入棚检疫" | "复检";
  cageNo: string; // 运输笼号
  temperature: string; // 体温原始输入
  respiratory: "" | "正常" | "异常";
  feces: "" | "正常" | "异常";
  recordedAt: string; // ISO
}

export type DraftValidation =
  | {
      ok: true;
      value: {
        ring: string;
        trainingId: string | null;
        kind: "入棚检疫" | "复检";
        cageNo: string;
        temperatureC: number;
        respiratory: "正常" | "异常";
        feces: "正常" | "异常";
        recordedAt: string;
        abnormalItems: string[];
        outcome: "通过" | "转隔离";
      };
    }
  | { ok: false; missing: string[]; errors: string[] };

export function validateQuarantineDraft(draft: QuarantineDraft): DraftValidation {
  const missing: string[] = [];
  const errors: string[] = [];

  if (!draft.ring) missing.push("足环号");

  const cageNo = draft.cageNo.trim();
  if (!cageNo) missing.push("运输笼号");

  const tempText = draft.temperature.trim();
  let temperatureC = NaN;
  if (!tempText) {
    missing.push("体温");
  } else {
    temperatureC = Number(tempText);
    if (!Number.isFinite(temperatureC)) {
      errors.push("体温必须是数字");
    } else if (temperatureC < TEMP_PLAUSIBLE_MIN || temperatureC > TEMP_PLAUSIBLE_MAX) {
      errors.push(`体温超出可录入范围（${TEMP_PLAUSIBLE_MIN}–${TEMP_PLAUSIBLE_MAX}℃），请核对`);
    }
  }

  if (!draft.respiratory) missing.push("呼吸道");
  if (!draft.feces) missing.push("粪便");
  if (!draft.recordedAt) missing.push("登记时间");

  if (missing.length > 0 || errors.length > 0) {
    return { ok: false, missing, errors };
  }

  const abnormalItems = findAbnormalItems({
    temperatureC,
    respiratory: draft.respiratory as "正常" | "异常",
    feces: draft.feces as "正常" | "异常",
  });

  return {
    ok: true,
    value: {
      ring: draft.ring,
      trainingId: draft.trainingId,
      kind: draft.kind,
      cageNo,
      temperatureC,
      respiratory: draft.respiratory as "正常" | "异常",
      feces: draft.feces as "正常" | "异常",
      recordedAt: draft.recordedAt,
      abnormalItems,
      // 任一异常 => 只能转隔离，没有第二个选项
      outcome: abnormalItems.length > 0 ? "转隔离" : "通过",
    },
  };
}

export function findAbnormalItems(input: {
  temperatureC: number;
  respiratory: "正常" | "异常";
  feces: "正常" | "异常";
}): string[] {
  const items: string[] = [];
  if (input.temperatureC < TEMP_NORMAL_MIN || input.temperatureC > TEMP_NORMAL_MAX) {
    items.push("体温");
  }
  if (input.respiratory === "异常") items.push("呼吸道");
  if (input.feces === "异常") items.push("粪便");
  return items;
}

// ---------------------------------------------------------------------------
// 2. 状态推导：正常 / 隔离中 / 观察中
// ---------------------------------------------------------------------------

export type PigeonStatus =
  | { kind: "正常" }
  | { kind: "隔离中"; since: string; recordId: string }
  | { kind: "观察中"; since: string; cageNo: string; sourceRing: string };

/** 当前有效的检疫记录（被更正过的旧记录不参与推导，但保留可查） */
export function effectiveQuarantines(state: LoftState): QuarantineRecord[] {
  return state.quarantines.filter((q) => q.supersededBy === null);
}

/** 某羽最近一次有效的入棚检疫 */
export function latestAdmission(state: LoftState, ring: string): QuarantineRecord | null {
  const list = effectiveQuarantines(state)
    .filter((q) => q.ring === ring && q.kind === "入棚检疫")
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  return list[0] ?? null;
}

function hasReleaseAfter(state: LoftState, ring: string, isoTime: string): boolean {
  const t = Date.parse(isoTime);
  return state.releases.some((r) => r.ring === ring && Date.parse(r.releasedAt) > t);
}

/** 同笼判定：同运输笼号且检疫登记时间相近（同批运输的各羽有各自的训放记录，不能按批次 id 判） */
function sameBatch(a: QuarantineRecord, b: QuarantineRecord): boolean {
  if (a.cageNo !== b.cageNo) return false;
  return Math.abs(Date.parse(a.recordedAt) - Date.parse(b.recordedAt)) <= SAME_BATCH_WINDOW_MS;
}

/** 推导全棚每羽状态。隔离鸽的同笼鸽进入观察，但保留原成绩记录。 */
export function deriveStatuses(state: LoftState): Map<string, PigeonStatus> {
  const result = new Map<string, PigeonStatus>();
  const isolated: { ring: string; admission: QuarantineRecord }[] = [];

  for (const pigeon of state.pigeons) {
    const admission = latestAdmission(state, pigeon.ring);
    if (
      admission &&
      admission.outcome === "转隔离" &&
      !hasReleaseAfter(state, pigeon.ring, admission.recordedAt)
    ) {
      isolated.push({ ring: pigeon.ring, admission });
      result.set(pigeon.ring, {
        kind: "隔离中",
        since: admission.recordedAt,
        recordId: admission.id,
      });
    }
  }

  for (const pigeon of state.pigeons) {
    if (result.has(pigeon.ring)) continue;
    const admission = latestAdmission(state, pigeon.ring);
    if (admission) {
      const source = isolated.find((iso) => sameBatch(iso.admission, admission));
      if (source) {
        result.set(pigeon.ring, {
          kind: "观察中",
          since: source.admission.recordedAt,
          cageNo: source.admission.cageNo,
          sourceRing: source.ring,
        });
        continue;
      }
    }
    result.set(pigeon.ring, { kind: "正常" });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. 恢复规则：隔离满 48 小时且复检正常
// ---------------------------------------------------------------------------

export interface RecoveryCheck {
  since: string;
  elapsedHours: number;
  remainingHours: number;
  lastRecheck: QuarantineRecord | null;
  ok: boolean;
  reasons: string[]; // 未满足恢复条件的原因（用于界面说明与训放拦截）
}

export function checkRecovery(
  state: LoftState,
  ring: string,
  now: Date,
): RecoveryCheck | null {
  const status = deriveStatuses(state).get(ring);
  if (!status || status.kind !== "隔离中") return null;

  const sinceMs = Date.parse(status.since);
  const elapsedHours = (now.getTime() - sinceMs) / 3600_000;
  const remainingHours = Math.max(0, ISOLATION_HOURS - elapsedHours);

  const rechecks = effectiveQuarantines(state)
    .filter(
      (q) =>
        q.ring === ring && q.kind === "复检" && Date.parse(q.recordedAt) > sinceMs,
    )
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const lastRecheck = rechecks[0] ?? null;

  const reasons: string[] = [];
  if (remainingHours > 0) {
    reasons.push(
      `隔离未满 ${ISOLATION_HOURS} 小时（已隔离 ${formatHours(elapsedHours)}，还需 ${formatHours(remainingHours)}）`,
    );
  }
  if (!lastRecheck) {
    reasons.push("尚未复检，需登记复检且结果正常");
  } else if (lastRecheck.abnormalItems.length > 0) {
    reasons.push(`最近复检仍存在异常项（${lastRecheck.abnormalItems.join("、")}），须复检正常`);
  }

  return {
    since: status.since,
    elapsedHours,
    remainingHours,
    lastRecheck,
    ok: reasons.length === 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// 4. 训放准入：未恢复前再次训放要挡住并说明原因
// ---------------------------------------------------------------------------

export type TrainAdmission =
  | { ok: true; warning: string | null }
  | { ok: false; reason: string };

export function checkTrainAdmission(
  state: LoftState,
  ring: string,
  now: Date,
): TrainAdmission {
  const pigeon = state.pigeons.find((p) => p.ring === ring);
  if (!pigeon) return { ok: false, reason: `足环号 ${ring} 不在鸽棚名册中` };

  const status = deriveStatuses(state).get(ring);
  if (status?.kind === "隔离中") {
    const recovery = checkRecovery(state, ring, now);
    const detail =
      recovery && recovery.reasons.length > 0
        ? recovery.reasons.join("；")
        : "已满足恢复条件，请先在「隔离与观察」面板办理解除隔离";
    return { ok: false, reason: `${ring} 隔离未解除，不能安排训放：${detail}` };
  }
  if (status?.kind === "观察中") {
    return {
      ok: true,
      warning: `${ring} 处于观察期（同笼 ${status.sourceRing} 隔离中，笼号 ${status.cageNo}），允许训放并保留记录，请加强关注`,
    };
  }
  return { ok: true, warning: null };
}

// ---------------------------------------------------------------------------
// 5. 排行 / 归巢率 / 提醒：隔离鸽退出，观察鸽保留
// ---------------------------------------------------------------------------

export interface RankingEntry {
  ring: string;
  bloodline: string;
  flights: number; // 归巢羽次
  bestSpeed: number; // 米/分
  avgSpeed: number; // 米/分
  bestDistanceKm: number;
  status: PigeonStatus["kind"];
}

export type DistanceClass = "全部" | "短距离" | "中距离" | "长距离";

export function distanceClassOf(km: number): Exclude<DistanceClass, "全部"> {
  if (km < 150) return "短距离";
  if (km <= 300) return "中距离";
  return "长距离";
}

export function buildRanking(
  state: LoftState,
  filter: { bloodline: string | null; distanceClass: DistanceClass; role: "全部" | Pigeon["role"] },
): RankingEntry[] {
  const statuses = deriveStatuses(state);
  const entries: RankingEntry[] = [];

  for (const pigeon of state.pigeons) {
    const status = statuses.get(pigeon.ring) ?? { kind: "正常" as const };
    if (status.kind === "隔离中") continue; // 隔离鸽退出成绩排行
    if (filter.bloodline && pigeon.bloodline !== filter.bloodline) continue;
    if (filter.role !== "全部" && pigeon.role !== filter.role) continue;

    const records = state.trainings.filter(
      (t) =>
        t.ring === pigeon.ring &&
        t.returnedAt !== null &&
        t.speedMpm !== null &&
        (filter.distanceClass === "全部" ||
          distanceClassOf(t.distanceKm) === filter.distanceClass),
    );
    if (records.length === 0) continue;

    const speeds = records.map((t) => t.speedMpm as number);
    entries.push({
      ring: pigeon.ring,
      bloodline: pigeon.bloodline,
      flights: records.length,
      bestSpeed: Math.max(...speeds),
      avgSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
      bestDistanceKm: Math.max(...records.map((t) => t.distanceKm)),
      status: status.kind,
    });
  }

  return entries.sort((a, b) => b.bestSpeed - a.bestSpeed);
}

export interface LoftMetrics {
  homeRate: number | null; // 归巢率 %（隔离鸽退出统计）
  avgSpeed: number | null; // 平均速度 米/分
  unreturned: TrainingRecord[]; // 未归巢提醒（不含隔离鸽）
  unreturnedIsolated: TrainingRecord[]; // 隔离鸽的未归巢记录（单列，不计数）
  isolatedCount: number;
  observingCount: number;
}

export function computeMetrics(state: LoftState): LoftMetrics {
  const statuses = deriveStatuses(state);
  const isIsolated = (ring: string) => statuses.get(ring)?.kind === "隔离中";

  const active = state.trainings.filter((t) => !isIsolated(t.ring));
  const returned = active.filter((t) => t.returnedAt !== null);
  const speeds = returned
    .map((t) => t.speedMpm)
    .filter((s): s is number => s !== null);

  return {
    homeRate:
      active.length === 0 ? null : Math.round((returned.length / active.length) * 1000) / 10,
    avgSpeed:
      speeds.length === 0
        ? null
        : Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length),
    unreturned: active
      .filter((t) => t.returnedAt === null)
      .sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt)),
    unreturnedIsolated: state.trainings.filter(
      (t) => t.returnedAt === null && isIsolated(t.ring),
    ),
    isolatedCount: state.pigeons.filter((p) => statuses.get(p.ring)?.kind === "隔离中").length,
    observingCount: state.pigeons.filter((p) => statuses.get(p.ring)?.kind === "观察中").length,
  };
}

// ---------------------------------------------------------------------------
// 6. 单羽档案：由状态推导，更正后自动重算
// ---------------------------------------------------------------------------

export interface PigeonProfile {
  pigeon: Pigeon;
  status: PigeonStatus;
  flights: number;
  returns: number;
  homeRate: number | null;
  bestSpeed: number | null;
  trainings: TrainingRecord[];
  /** 检疫全历史（含被更正的旧结论），新→旧排序 */
  quarantineHistory: QuarantineRecord[];
}

export function buildProfile(state: LoftState, ring: string): PigeonProfile | null {
  const pigeon = state.pigeons.find((p) => p.ring === ring);
  if (!pigeon) return null;

  const trainings = state.trainings
    .filter((t) => t.ring === ring)
    .sort((a, b) => Date.parse(b.releasedAt) - Date.parse(a.releasedAt));
  const returned = trainings.filter((t) => t.returnedAt !== null);
  const speeds = returned
    .map((t) => t.speedMpm)
    .filter((s): s is number => s !== null);

  return {
    pigeon,
    status: deriveStatuses(state).get(ring) ?? { kind: "正常" },
    flights: trainings.length,
    returns: returned.length,
    homeRate:
      trainings.length === 0
        ? null
        : Math.round((returned.length / trainings.length) * 1000) / 10,
    bestSpeed: speeds.length === 0 ? null : Math.max(...speeds),
    trainings,
    quarantineHistory: state.quarantines
      .filter((q) => q.ring === ring)
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)),
  };
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  if (hours < 48) return `${Math.floor(hours)} 小时 ${Math.round((hours % 1) * 60)} 分`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${Math.round(hours % 24)} 小时`;
}

export function computeSpeedMpm(distanceKm: number, releasedAt: string, returnedAt: string): number | null {
  const minutes = (Date.parse(returnedAt) - Date.parse(releasedAt)) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(((distanceKm * 1000) / minutes) * 10) / 10;
}
