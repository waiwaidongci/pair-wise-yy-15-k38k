// React 粘合层：把规则层与持久化层接到界面上。
// 状态变更一律走"规则校验 -> 产生新 state -> useEffect 落盘"，
// 因此刷新后界面与本地存储保持一致。

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LoftState, QuarantineRecord, TrainingRecord } from "../domain/types";
import {
  checkRecovery,
  checkTrainAdmission,
  computeSpeedMpm,
  deriveStatuses,
  validateQuarantineDraft,
  type QuarantineDraft,
} from "../domain/rules";
import { loadState, resetState, saveState } from "./store";

function nextId(prefix: string, existing: { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    const match = item.id.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export interface TrainingDraft {
  ring: string;
  location: string;
  distanceKm: string;
  weather: string;
  releasedAt: string;
  returnedAt: string; // 可为空字符串 = 未归巢
}

export function useLoft() {
  const [state, setState] = useState<LoftState>(loadState);
  const [now, setNow] = useState(() => new Date());

  // 任何状态变化都立即持久化，刷新后保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 让隔离倒计时等随时间推进
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  /** 入棚检疫 / 复检登记：缺项不保存，任一异常只能转隔离 */
  const registerQuarantine = useCallback((draft: QuarantineDraft): ActionResult => {
    const result = validateQuarantineDraft(draft);
    if (!result.ok) {
      const parts: string[] = [];
      if (result.missing.length > 0) parts.push(`缺少必填项：${result.missing.join("、")}`);
      parts.push(...result.errors);
      return { ok: false, message: `未保存。${parts.join("；")}` };
    }
    const v = result.value;
    setState((prev) => {
      const record: QuarantineRecord = {
        id: nextId("Q", prev.quarantines),
        ring: v.ring,
        trainingId: v.trainingId,
        kind: v.kind,
        cageNo: v.cageNo,
        temperatureC: v.temperatureC,
        respiratory: v.respiratory,
        feces: v.feces,
        recordedAt: v.recordedAt,
        abnormalItems: v.abnormalItems,
        outcome: v.outcome,
        revision: 1,
        supersedes: null,
        supersededBy: null,
      };
      return { ...prev, quarantines: [...prev.quarantines, record] };
    });
    return {
      ok: true,
      message:
        v.outcome === "转隔离"
          ? `已登记并转隔离（异常项：${v.abnormalItems.join("、")}），同笼鸽已转入观察`
          : "检疫通过，已登记",
    };
  }, []);

  /** 更正检疫：旧记录保留可查，新记录作为有效结论参与重算 */
  const correctQuarantine = useCallback(
    (oldId: string, draft: QuarantineDraft): ActionResult => {
      const result = validateQuarantineDraft(draft);
      if (!result.ok) {
        const parts: string[] = [];
        if (result.missing.length > 0) parts.push(`缺少必填项：${result.missing.join("、")}`);
        parts.push(...result.errors);
        return { ok: false, message: `未保存。${parts.join("；")}` };
      }
      let message = "";
      setState((prev) => {
        const old = prev.quarantines.find((q) => q.id === oldId);
        if (!old || old.supersededBy !== null) {
          message = "该记录不存在或已被更正，未保存";
          return prev;
        }
        const v = result.value;
        const record: QuarantineRecord = {
          id: nextId("Q", prev.quarantines),
          ring: old.ring,
          trainingId: v.trainingId,
          kind: old.kind,
          cageNo: v.cageNo,
          temperatureC: v.temperatureC,
          respiratory: v.respiratory,
          feces: v.feces,
          recordedAt: v.recordedAt,
          abnormalItems: v.abnormalItems,
          outcome: v.outcome,
          revision: old.revision + 1,
          supersedes: old.id,
          supersededBy: null,
        };
        message = `已更正（第 ${record.revision} 版），排行、提醒与档案已同步重算，旧结论保留可查`;
        return {
          ...prev,
          quarantines: prev.quarantines.map((q) =>
            q.id === old.id ? { ...q, supersededBy: record.id } : q,
          ).concat(record),
        };
      });
      return message.startsWith("已更正") ? { ok: true, message } : { ok: false, message };
    },
    [],
  );

  /** 解除隔离：仅当满 48 小时且复检正常 */
  const releaseIsolation = useCallback(
    (ring: string): ActionResult => {
      const check = checkRecovery(state, ring, new Date());
      if (!check) return { ok: false, message: `${ring} 当前不在隔离中` };
      if (!check.ok) {
        return { ok: false, message: `未解除。${check.reasons.join("；")}` };
      }
      const recheck = check.lastRecheck;
      if (!recheck) return { ok: false, message: "尚未复检，不能解除" };
      const status = deriveStatuses(state).get(ring);
      const afterRecordId = status && status.kind === "隔离中" ? status.recordId : recheck.id;
      setState((prev) => ({
        ...prev,
        releases: [
          ...prev.releases,
          {
            id: nextId("R", prev.releases),
            ring,
            afterRecordId,
            recheckId: recheck.id,
            releasedAt: new Date().toISOString(),
          },
        ],
      }));
      return { ok: true, message: `${ring} 已解除隔离并恢复归巢率与排行统计，同笼观察同步解除` };
    },
    [state],
  );

  /** 新增训放：隔离未恢复会被挡住并说明原因 */
  const addTraining = useCallback(
    (draft: TrainingDraft): ActionResult => {
      const admission = checkTrainAdmission(state, draft.ring, new Date());
      if (!admission.ok) return { ok: false, message: `已拦截。${admission.reason}` };

      const distanceKm = Number(draft.distanceKm);
      if (!draft.location.trim()) return { ok: false, message: "未保存。请填写训放地点" };
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        return { ok: false, message: "未保存。放飞距离必须是大于 0 的数字" };
      }
      if (!draft.releasedAt) return { ok: false, message: "未保存。请填写放飞时间" };

      const returnedAt = draft.returnedAt || null;
      const speedMpm = returnedAt
        ? computeSpeedMpm(distanceKm, draft.releasedAt, returnedAt)
        : null;
      if (returnedAt && speedMpm === null) {
        return { ok: false, message: "未保存。归巢时间必须晚于放飞时间" };
      }

      setState((prev) => {
        const record: TrainingRecord = {
          id: nextId("T", prev.trainings),
          ring: draft.ring,
          location: draft.location.trim(),
          distanceKm,
          weather: draft.weather.trim() || "未记录",
          releasedAt: new Date(draft.releasedAt).toISOString(),
          returnedAt: returnedAt ? new Date(returnedAt).toISOString() : null,
          speedMpm,
        };
        return { ...prev, trainings: [...prev.trainings, record] };
      });
      return {
        ok: true,
        message: admission.warning ? `已保存。${admission.warning}` : "训放记录已保存",
      };
    },
    [state],
  );

  /** 登记归巢：补录归巢时间并重算速度 */
  const markReturned = useCallback((trainingId: string, returnedAt: string): ActionResult => {
    if (!returnedAt) return { ok: false, message: "请选择归巢时间" };
    let message = "已登记归巢";
    let failed = false;
    setState((prev) => {
      const target = prev.trainings.find((t) => t.id === trainingId);
      if (!target) {
        failed = true;
        message = "记录不存在";
        return prev;
      }
      const speed = computeSpeedMpm(target.distanceKm, target.releasedAt, returnedAt);
      if (speed === null) {
        failed = true;
        message = "归巢时间必须晚于放飞时间";
        return prev;
      }
      return {
        ...prev,
        trainings: prev.trainings.map((t) =>
          t.id === trainingId
            ? { ...t, returnedAt: new Date(returnedAt).toISOString(), speedMpm: speed }
            : t,
        ),
      };
    });
    return failed ? { ok: false, message } : { ok: true, message };
  }, []);

  const reset = useCallback(() => setState(resetState()), []);

  return useMemo(
    () => ({
      state,
      now,
      registerQuarantine,
      correctQuarantine,
      releaseIsolation,
      addTraining,
      markReturned,
      reset,
    }),
    [state, now, registerQuarantine, correctQuarantine, releaseIsolation, addTraining, markReturned, reset],
  );
}
