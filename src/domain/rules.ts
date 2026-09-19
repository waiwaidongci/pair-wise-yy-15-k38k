// 状态规则层：全部为纯函数，只依赖领域模型，不碰 React / localStorage。
// 鸽只状态（正常 / 隔离 / 观察）完全由检疫事件时间线推导，更正后重算即得新状态。

import type {
  Database,
  Entry,
  HealthSign,
  Pigeon,
  QuarantineCheck,
  Recheck,
  StatusInfo,
} from "./types";

export const TEMP_MIN = 40.0;
export const TEMP_MAX = 42.5;
/** 体温录入的合理物理区间，超出视为无效输入而非“异常” */
export const TEMP_SANE_MIN = 35.0;
export const TEMP_SANE_MAX = 45.0;
export const ISOLATION_MS = 48 * 60 * 60 * 1000;

export type Result<T = Database> = { ok: true; data: T } | { ok: false; error: string };

export function uid(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

interface Conclusion {
  temperature: number;
  respiratory: HealthSign;
  feces: HealthSign;
  cageCondition: HealthSign;
}

/** 任一指标异常即异常；体温以赛鸽 40.0~42.5℃ 为正常区间 */
export function isAbnormal(c: Conclusion): boolean {
  return (
    c.temperature < TEMP_MIN ||
    c.temperature > TEMP_MAX ||
    c.respiratory === "abnormal" ||
    c.feces === "abnormal" ||
    c.cageCondition === "abnormal"
  );
}

export function abnormalReasons(c: Conclusion): string[] {
  const reasons: string[] = [];
  if (c.temperature < TEMP_MIN || c.temperature > TEMP_MAX)
    reasons.push(`体温${c.temperature.toFixed(1)}℃`);
  if (c.respiratory === "abnormal") reasons.push("呼吸道异常");
  if (c.feces === "abnormal") reasons.push("粪便异常");
  if (c.cageCondition === "abnormal") reasons.push("运输笼异常");
  return reasons;
}

export interface CheckInput {
  cageNo: string;
  temperature: number | "";
  respiratory: HealthSign | "";
  feces: HealthSign | "";
  cageCondition: HealthSign | "";
  note?: string;
  checkTime: number;
}

/** 回棚登记校验：体温、呼吸道、粪便、运输笼缺项一律不保存 */
export function validateCheckInput(input: CheckInput, releaseTime?: number): string | null {
  if (!input.cageNo.trim()) return "运输笼编号未填写，缺项不能保存";
  if (input.temperature === "" || Number.isNaN(input.temperature))
    return "体温未填写，缺项不能保存";
  if (input.temperature < TEMP_SANE_MIN || input.temperature > TEMP_SANE_MAX)
    return `体温需在 ${TEMP_SANE_MIN.toFixed(1)}~${TEMP_SANE_MAX.toFixed(1)}℃ 之间`;
  if (input.respiratory === "") return "呼吸道未检查，缺项不能保存";
  if (input.feces === "") return "粪便未检查，缺项不能保存";
  if (input.cageCondition === "") return "运输笼状况未检查，缺项不能保存";
  if (!Number.isFinite(input.checkTime) || input.checkTime <= 0) return "检疫时间无效";
  if (releaseTime !== undefined && input.checkTime < releaseTime)
    return "归巢检疫时间不能早于放飞时间";
  return null;
}

// ---------------------------------------------------------------------------
// 状态推导：把每羽鸽的“检疫 + 复检”按时间排成事件流
// 异常事件 -> 进入隔离（开始计时）；异常复检 -> 重新计时
// 隔离满 48 小时之后出现任一四项正常的检疫事件 -> 恢复
// ---------------------------------------------------------------------------

type TimedEvent =
  | { kind: "check"; time: number; abnormal: boolean; check: QuarantineCheck }
  | { kind: "recheck"; time: number; abnormal: boolean; recheck: Recheck };

function eventsOf(db: Database, pigeonId: string): TimedEvent[] {
  const events: TimedEvent[] = [];
  for (const check of db.checks) {
    if (check.pigeonId !== pigeonId) continue;
    events.push({
      kind: "check",
      time: check.checkTime,
      abnormal: isAbnormal(check),
      check,
    });
  }
  for (const recheck of db.rechecks) {
    if (recheck.pigeonId !== pigeonId) continue;
    events.push({
      kind: "recheck",
      time: recheck.checkTime,
      abnormal: isAbnormal(recheck),
      recheck,
    });
  }
  return events.sort((a, b) => a.time - b.time);
}

interface IsolationState {
  isolated: boolean;
  startedAt: number;
  sourceEvent: TimedEvent | null;
}

function isolationOf(db: Database, pigeonId: string): IsolationState {
  let state: IsolationState = { isolated: false, startedAt: 0, sourceEvent: null };
  for (const ev of eventsOf(db, pigeonId)) {
    if (ev.abnormal) {
      state = { isolated: true, startedAt: ev.time, sourceEvent: ev };
    } else if (state.isolated && ev.time >= state.startedAt + ISOLATION_MS) {
      // 满 48 小时且本次复检/检疫四项正常，恢复
      state = { isolated: false, startedAt: 0, sourceEvent: null };
    }
    // 未满 48 小时的正常复检：记录在案，但不改变隔离状态
  }
  return state;
}

function entryOf(db: Database, sessionId: string, pigeonId: string): Entry | undefined {
  return db.entries.find((e) => e.sessionId === sessionId && e.pigeonId === pigeonId);
}

/** 观察来源：某羽仍在隔离的鸽，与本鸽同次训放同笼且其检疫异常 */
export interface Exposure {
  pigeonId: string;
  checkId: string;
  cageNo: string;
  checkTime: number;
}

function activeExposures(
  db: Database,
  pigeonId: string,
  isolatedPigeonIds: Set<string>
): Exposure[] {
  const exposures: Exposure[] = [];
  for (const check of db.checks) {
    if (check.pigeonId === pigeonId) continue;
    if (!isAbnormal(check)) continue;
    if (!isolatedPigeonIds.has(check.pigeonId)) continue; // 来源已恢复/更正为正常，接触解除
    const myEntry = entryOf(db, check.sessionId, pigeonId);
    if (!myEntry || myEntry.cageNo !== check.cageNo) continue;
    // 本鸽复检正常即可解除观察；异常复检会在事件流中使其自身进入隔离
    const cleared = db.rechecks.some(
      (r) =>
        r.pigeonId === pigeonId &&
        r.checkTime >= check.checkTime &&
        !isAbnormal(r)
    );
    if (!cleared) {
      exposures.push({
        pigeonId: check.pigeonId,
        checkId: check.id,
        cageNo: check.cageNo,
        checkTime: check.checkTime,
      });
    }
  }
  return exposures.sort((a, b) => b.checkTime - a.checkTime);
}

export function deriveAllStatuses(db: Database, now: number): Map<string, StatusInfo> {
  const map = new Map<string, StatusInfo>();
  const isolatedIds = new Set<string>();
  const isoCache = new Map<string, IsolationState>();

  for (const pigeon of db.pigeons) {
    isoCache.set(pigeon.id, isolationOf(db, pigeon.id));
    if (isoCache.get(pigeon.id)!.isolated) isolatedIds.add(pigeon.id);
  }

  for (const pigeon of db.pigeons) {
    const iso = isoCache.get(pigeon.id)!;
    const rechecks = db.rechecks
      .filter((r) => r.pigeonId === pigeon.id)
      .sort((a, b) => a.checkTime - b.checkTime);

    if (iso.isolated && iso.sourceEvent) {
      const ev = iso.sourceEvent;
      map.set(pigeon.id, {
        status: "isolated",
        reason: "isolation",
        isolatedAt: iso.startedAt,
        recoverableAt: iso.startedAt + ISOLATION_MS,
        rechecks,
        sourceCheck:
          ev.kind === "check"
            ? ev.check
            : db.checks.find((c) => c.id === ev.recheck.checkId),
      });
      continue;
    }

    const exposures = activeExposures(db, pigeon.id, isolatedIds);
    if (exposures.length > 0) {
      const ex = exposures[0];
      map.set(pigeon.id, {
        status: "observation",
        reason: "observation",
        rechecks,
        exposedBy: { pigeonId: ex.pigeonId, checkId: ex.checkId, cageNo: ex.cageNo },
      });
      continue;
    }

    map.set(pigeon.id, { status: "normal", reason: "normal", rechecks });
  }
  return map;
}

// ---------------------------------------------------------------------------
// 再次训放（上笼）拦截
// ---------------------------------------------------------------------------

export interface ReleaseBlock {
  blocked: boolean;
  /** blocked=false 时仍可能给出观察提示 */
  warning?: string;
}

export function releaseBlocker(info: StatusInfo, now: number): ReleaseBlock {
  if (info.status === "isolated") {
    const start = info.isolatedAt ?? 0;
    const elapsed = now - start;
    const afterStart = info.rechecks.filter((r) => r.checkTime >= start);
    const latest = afterStart.length ? afterStart[afterStart.length - 1] : undefined;

    if (elapsed >= ISOLATION_MS) {
      return {
        blocked: true,
        warning:
          "隔离已满48小时，尚未完成四项正常的复检，复检通过后方可恢复训放",
      };
    }
    const remainH = Math.ceil((ISOLATION_MS - elapsed) / 3600000);
    if (latest && isAbnormal(latest)) {
      return {
        blocked: true,
        warning: `最近一次复检异常，隔离已重新计时，距满48小时还差约 ${remainH} 小时，期间不得再次训放`,
      };
    }
    if (latest) {
      return {
        blocked: true,
        warning: `复检正常但隔离尚未满48小时，还差约 ${remainH} 小时，期间不得再次训放`,
      };
    }
    return {
      blocked: true,
      warning: `隔离观察中，距满48小时还差约 ${remainH} 小时，满48小时且复检正常前不得再次训放`,
    };
  }
  if (info.status === "observation") {
    return { blocked: false, warning: "同笼观察中，建议复检正常后再上笼（不强制拦截）" };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// 写操作：登记检疫 / 复检 / 更正检疫 / 新建训放上笼
// ---------------------------------------------------------------------------

export function calcSpeed(distanceKm: number, releaseTime: number, returnTime: number) {
  const minutes = (returnTime - releaseTime) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  return Math.round((distanceKm * 1000) / minutes);
}

export function registerCheck(
  db: Database,
  params: { entryId: string; input: CheckInput }
): Result {
  const entry = db.entries.find((e) => e.id === params.entryId);
  if (!entry) return { ok: false, error: "参赛记录不存在" };
  if (entry.returned) return { ok: false, error: "该羽已完成回棚登记，请勿重复登记" };
  const session = db.sessions.find((s) => s.id === entry.sessionId);
  if (!session) return { ok: false, error: "训放记录不存在" };

  const error = validateCheckInput(params.input, session.releaseTime);
  if (error) return { ok: false, error };

  const next: Database = structuredClone(db);
  const nextEntry = next.entries.find((e) => e.id === params.entryId)!;
  const input = params.input;
  nextEntry.returned = true;
  nextEntry.returnTime = input.checkTime;
  nextEntry.cageNo = input.cageNo.trim();
  nextEntry.speedMpm = calcSpeed(session.distanceKm, session.releaseTime, input.checkTime);

  next.checks.push({
    id: uid("chk"),
    pigeonId: entry.pigeonId,
    sessionId: entry.sessionId,
    cageNo: input.cageNo.trim(),
    temperature: input.temperature as number,
    respiratory: input.respiratory as HealthSign,
    feces: input.feces as HealthSign,
    cageCondition: input.cageCondition as HealthSign,
    note: input.note?.trim() || undefined,
    checkTime: input.checkTime,
    revisions: [],
  });
  return { ok: true, data: next };
}

export function addRecheck(
  db: Database,
  params: { pigeonId: string; checkId: string; input: CheckInput }
): Result {
  const pigeon = db.pigeons.find((p) => p.id === params.pigeonId);
  if (!pigeon) return { ok: false, error: "赛鸽不存在" };
  const error = validateCheckInput(params.input);
  if (error) return { ok: false, error };
  const input = params.input;
  const next: Database = structuredClone(db);
  next.rechecks.push({
    id: uid("rck"),
    pigeonId: params.pigeonId,
    checkId: params.checkId,
    temperature: input.temperature as number,
    respiratory: input.respiratory as HealthSign,
    feces: input.feces as HealthSign,
    cageCondition: input.cageCondition as HealthSign,
    note: input.note?.trim() || undefined,
    checkTime: input.checkTime,
  });
  return { ok: true, data: next };
}

/** 更正检疫：保存旧结论快照（旧结论可查），排行/提醒/档案依据当前结论重算 */
export function correctCheck(
  db: Database,
  params: { checkId: string; reason: string; patch: CheckInput }
): Result {
  const check = db.checks.find((c) => c.id === params.checkId);
  if (!check) return { ok: false, error: "检疫记录不存在" };
  if (!params.reason.trim()) return { ok: false, error: "更正必须填写原因，缺项不能保存" };
  const session = db.sessions.find((s) => s.id === check.sessionId);
  const error = validateCheckInput(params.patch, session?.releaseTime);
  if (error) return { ok: false, error };

  const next: Database = structuredClone(db);
  const target = next.checks.find((c) => c.id === params.checkId)!;
  target.revisions.push({
    revisedAt: Date.now(),
    reason: params.reason.trim(),
    snapshot: {
      temperature: check.temperature,
      respiratory: check.respiratory,
      feces: check.feces,
      cageCondition: check.cageCondition,
      cageNo: check.cageNo,
      note: check.note,
    },
  });
  target.temperature = params.patch.temperature as number;
  target.respiratory = params.patch.respiratory as HealthSign;
  target.feces = params.patch.feces as HealthSign;
  target.cageCondition = params.patch.cageCondition as HealthSign;
  target.cageNo = params.patch.cageNo.trim();
  target.note = params.patch.note?.trim() || undefined;
  target.checkTime = params.patch.checkTime;
  return { ok: true, data: next };
}

export interface CagePlan {
  cageNo: string;
  pigeonIds: string[];
}

export function createSession(
  db: Database,
  params: {
    location: string;
    distanceKm: number;
    weather: string;
    releaseTime: number;
    cages: CagePlan[];
  },
  blocks: Map<string, ReleaseBlock>,
  now: number
): Result {
  if (!params.location.trim()) return { ok: false, error: "训放地点未填写" };
  if (!Number.isFinite(params.distanceKm) || params.distanceKm <= 0)
    return { ok: false, error: "放飞距离需为大于 0 的数字" };
  if (!params.releaseTime || params.releaseTime > now + 600000)
    return { ok: false, error: "放飞时间无效" };

  const plans = params.cages
    .map((c) => ({ cageNo: c.cageNo.trim(), pigeonIds: c.pigeonIds }))
    .filter((c) => c.cageNo && c.pigeonIds.length > 0);
  if (plans.length === 0) return { ok: false, error: "至少为一羽赛鸽分配运输笼" };

  const seen = new Set<string>();
  for (const plan of plans) {
    for (const pid of plan.pigeonIds) {
      if (seen.has(pid)) return { ok: false, error: "同一羽赛鸽不能重复上笼" };
      seen.add(pid);
      const b = blocks.get(pid);
      if (b?.blocked) {
        const pigeon = db.pigeons.find((p) => p.id === pid);
        return { ok: false, error: `${pigeon?.ringNo ?? pid}：${b.warning}` };
      }
    }
  }

  const next: Database = structuredClone(db);
  const sessionId = uid("ses");
  next.sessions.push({
    id: sessionId,
    location: params.location.trim(),
    distanceKm: params.distanceKm,
    weather: params.weather.trim() || "未记录",
    releaseTime: params.releaseTime,
    cageAssignments: Object.fromEntries(
      plans.map((p) => [p.cageNo, [...p.pigeonIds]])
    ),
  });
  for (const plan of plans) {
    for (const pid of plan.pigeonIds) {
      next.entries.push({
        id: uid("ent"),
        sessionId,
        pigeonId: pid,
        cageNo: plan.cageNo,
        returned: false,
      });
    }
  }
  return { ok: true, data: next };
}

// ---------------------------------------------------------------------------
// 排行 / 归巢率：隔离鸽整体退出，观察鸽保留原记录
// ---------------------------------------------------------------------------

export type DistanceCategory = "all" | "short" | "middle" | "long";

export function distanceCategory(km: number): Exclude<DistanceCategory, "all"> {
  if (km < 150) return "short";
  if (km <= 400) return "middle";
  return "long";
}

export interface RankingRow {
  pigeon: Pigeon;
  entries: number;
  returned: number;
  homingRate: number;
  avgSpeed: number | null;
}

export function computeRankings(
  db: Database,
  statuses: Map<string, StatusInfo>,
  filter: { distance: DistanceCategory; bloodline: string }
): { rows: RankingRow[]; excluded: Pigeon[] } {
  const rows: RankingRow[] = [];
  const excluded: Pigeon[] = [];

  for (const pigeon of db.pigeons) {
    if (pigeon.role === "种鸽") continue;
    const info = statuses.get(pigeon.id);
    if (info?.status === "isolated") {
      excluded.push(pigeon);
      continue;
    }
    if (filter.bloodline !== "all" && pigeon.bloodline !== filter.bloodline) continue;

    const mine = db.entries.filter((e) => e.pigeonId === pigeon.id);
    const inScope = mine.filter((e) => {
      const session = db.sessions.find((s) => s.id === e.sessionId);
      if (!session) return false;
      return (
        filter.distance === "all" ||
        distanceCategory(session.distanceKm) === filter.distance
      );
    });
    const returned = inScope.filter((e) => e.returned);
    const speeds = returned.map((e) => e.speedMpm).filter((v): v is number => !!v);
    rows.push({
      pigeon,
      entries: inScope.length,
      returned: returned.length,
      homingRate: inScope.length ? returned.length / inScope.length : 0,
      avgSpeed: speeds.length
        ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
        : null,
    });
  }

  rows.sort((a, b) => {
    if (a.avgSpeed === null && b.avgSpeed === null) return b.homingRate - a.homingRate;
    if (a.avgSpeed === null) return 1;
    if (b.avgSpeed === null) return -1;
    return b.avgSpeed - a.avgSpeed;
  });
  return { rows, excluded };
}

export interface OverviewMetrics {
  totalPigeons: number;
  isolated: number;
  observation: number;
  unreturned: number;
  homingRate: number;
  avgSpeed: number | null;
}

export function computeOverview(
  db: Database,
  statuses: Map<string, StatusInfo>
): OverviewMetrics {
  let isolated = 0;
  let observation = 0;
  for (const p of db.pigeons) {
    const s = statuses.get(p.id)?.status;
    if (s === "isolated") isolated++;
    if (s === "observation") observation++;
  }
  const activeIds = new Set(
    db.pigeons.filter((p) => statuses.get(p.id)?.status !== "isolated").map((p) => p.id)
  );
  const scoped = db.entries.filter((e) => activeIds.has(e.pigeonId));
  const returned = scoped.filter((e) => e.returned);
  const speeds = returned.map((e) => e.speedMpm).filter((v): v is number => !!v);
  return {
    totalPigeons: db.pigeons.length,
    isolated,
    observation,
    unreturned: scoped.filter((e) => !e.returned).length,
    homingRate: scoped.length ? returned.length / scoped.length : 0,
    avgSpeed: speeds.length
      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
      : null,
  };
}

export interface UnreturnedRow {
  entry: Entry;
  pigeon: Pigeon;
  location: string;
  distanceKm: number;
  releaseTime: number;
  blocked: boolean;
  blockReason?: string;
}

export function computeUnreturned(
  db: Database,
  statuses: Map<string, StatusInfo>,
  now: number
): UnreturnedRow[] {
  const out: UnreturnedRow[] = [];
  for (const entry of db.entries.filter((e) => !e.returned)) {
    const pigeon = db.pigeons.find((p) => p.id === entry.pigeonId);
    const session = db.sessions.find((s) => s.id === entry.sessionId);
    if (!pigeon || !session) continue;
    const info = statuses.get(pigeon.id);
    const block = info ? releaseBlocker(info, now) : { blocked: false };
    out.push({
      entry,
      pigeon,
      location: session.location,
      distanceKm: session.distanceKm,
      releaseTime: session.releaseTime,
      blocked: block.blocked,
      blockReason: block.blocked ? block.warning : undefined,
    });
  }
  return out.sort((a, b) => a.releaseTime - b.releaseTime);
}
