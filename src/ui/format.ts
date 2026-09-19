// 界面层辅助：纯展示用的格式化与状态文案，不承载业务判定。

import type { Database, StatusInfo } from "../domain/types";
import { abnormalReasons, ISOLATION_MS } from "../domain/rules";

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number {
  if (!value) return NaN;
  return new Date(value).getTime();
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "已满48小时";
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `剩 ${h}小时${m}分` : `剩 ${m}分`;
}

export function fmtElapsed(ms: number): string {
  if (ms <= 0) return "0分钟";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`;
}

export const STATUS_LABEL: Record<StatusInfo["status"], string> = {
  normal: "正常",
  isolated: "隔离",
  observation: "观察",
};

export function statusTitle(db: Database, info: StatusInfo, now: number): string {
  if (info.status === "isolated" && info.sourceCheck) {
    const reasons = abnormalReasons(info.sourceCheck).join("、") || "指标异常";
    if (now >= (info.recoverableAt ?? 0)) {
      return `回棚检疫异常（${reasons}），隔离已满48小时，待复检恢复`;
    }
    return `回棚检疫异常（${reasons}），隔离中`;
  }
  if (info.status === "observation" && info.exposedBy) {
    const ring = db.pigeons.find((p) => p.id === info.exposedBy!.pigeonId)?.ringNo ?? "隔离鸽";
    return `与 ${ring} 同笼（${info.exposedBy.cageNo}）接触，进入观察`;
  }
  return "检疫正常";
}

export function isolationProgress(info: StatusInfo, now: number): number {
  if (info.status !== "isolated" || !info.isolatedAt) return 0;
  return Math.min(1, (now - info.isolatedAt) / ISOLATION_MS);
}
