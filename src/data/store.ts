// 持久化层：负责 localStorage 读写与初始种子数据。
// 不包含任何状态规则；规则见 src/domain/rules.ts。

import type { LoftState } from "../domain/types";

const STORAGE_KEY = "hxyfront-62014.loft.v1";

function hoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

/** 首次运行的种子数据：含一例进行中的隔离与其同笼观察鸽，便于演示规则 */
export function seedState(now: Date = new Date()): LoftState {
  return {
    pigeons: [
      { ring: "CHN-24-001839", bloodline: "詹森系", role: "赛鸽" },
      { ring: "CHN-24-002114", bloodline: "凡龙系", role: "赛鸽" },
      { ring: "CHN-24-003307", bloodline: "詹森系", role: "赛鸽" },
      { ring: "CHN-23-008771", bloodline: "慕利门系", role: "种鸽" },
      { ring: "CHN-23-009452", bloodline: "杨阿腾系", role: "赛鸽" },
      { ring: "CHN-22-015603", bloodline: "凡龙系", role: "赛鸽" },
    ],
    trainings: [
      {
        id: "T-001",
        ring: "CHN-24-001839",
        location: "衡水湖北岸",
        distanceKm: 80,
        weather: "晴",
        releasedAt: hoursAgo(now, 30),
        returnedAt: hoursAgo(now, 28.9),
        speedMpm: 1180,
      },
      {
        id: "T-002",
        ring: "CHN-24-002114",
        location: "衡水湖北岸",
        distanceKm: 80,
        weather: "晴",
        releasedAt: hoursAgo(now, 30),
        returnedAt: hoursAgo(now, 28.6),
        speedMpm: 1245,
      },
      {
        id: "T-003",
        ring: "CHN-24-003307",
        location: "衡水湖北岸",
        distanceKm: 80,
        weather: "晴",
        releasedAt: hoursAgo(now, 30),
        returnedAt: hoursAgo(now, 28.2),
        speedMpm: 1310,
      },
      {
        id: "T-004",
        ring: "CHN-23-009452",
        location: "石家庄西",
        distanceKm: 120,
        weather: "侧风",
        releasedAt: hoursAgo(now, 29),
        returnedAt: hoursAgo(now, 27.1),
        speedMpm: 1050,
      },
      {
        id: "T-005",
        ring: "CHN-22-015603",
        location: "石家庄西",
        distanceKm: 120,
        weather: "侧风",
        releasedAt: hoursAgo(now, 29),
        returnedAt: null,
        speedMpm: null,
      },
      {
        id: "T-006",
        ring: "CHN-24-001839",
        location: "德州南",
        distanceKm: 200,
        weather: "多云",
        releasedAt: hoursAgo(now, 26),
        returnedAt: hoursAgo(now, 23.1),
        speedMpm: 1150,
      },
      {
        id: "T-007",
        ring: "CHN-24-002114",
        location: "德州南",
        distanceKm: 200,
        weather: "多云",
        releasedAt: hoursAgo(now, 26),
        returnedAt: hoursAgo(now, 23.4),
        speedMpm: 1120,
      },
      {
        id: "T-008",
        ring: "CHN-23-008771",
        location: "沧州东",
        distanceKm: 150,
        weather: "阴",
        releasedAt: hoursAgo(now, 25),
        returnedAt: hoursAgo(now, 22.9),
        speedMpm: 1180,
      },
      {
        id: "T-009",
        ring: "CHN-24-003307",
        location: "沧州东",
        distanceKm: 150,
        weather: "阴",
        releasedAt: hoursAgo(now, 25),
        returnedAt: null,
        speedMpm: null,
      },
    ],
    quarantines: [
      // 同批归棚三羽：C-07 笼两羽（001839 通过、002114 转隔离），C-12 笼一羽通过
      {
        id: "Q-001",
        ring: "CHN-24-001839",
        trainingId: "T-006",
        kind: "入棚检疫",
        cageNo: "C-07",
        temperatureC: 41.2,
        respiratory: "正常",
        feces: "正常",
        recordedAt: hoursAgo(now, 23),
        abnormalItems: [],
        outcome: "通过",
        revision: 1,
        supersedes: null,
        supersededBy: null,
      },
      {
        id: "Q-002",
        ring: "CHN-24-002114",
        trainingId: "T-007",
        kind: "入棚检疫",
        cageNo: "C-07",
        temperatureC: 42.9,
        respiratory: "异常",
        feces: "正常",
        recordedAt: hoursAgo(now, 23),
        abnormalItems: ["体温", "呼吸道"],
        outcome: "转隔离",
        revision: 1,
        supersedes: null,
        supersededBy: null,
      },
      {
        id: "Q-003",
        ring: "CHN-24-003307",
        trainingId: "T-003",
        kind: "入棚检疫",
        cageNo: "C-12",
        temperatureC: 41.0,
        respiratory: "正常",
        feces: "正常",
        recordedAt: hoursAgo(now, 28),
        abnormalItems: [],
        outcome: "通过",
        revision: 1,
        supersedes: null,
        supersededBy: null,
      },
    ],
    releases: [],
  };
}

function isLoftState(value: unknown): value is LoftState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.pigeons) &&
    Array.isArray(v.trainings) &&
    Array.isArray(v.quarantines) &&
    Array.isArray(v.releases)
  );
}

/** 读取本地状态；不存在或损坏时回退到种子数据 */
export function loadState(): LoftState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed: unknown = JSON.parse(raw);
    return isLoftState(parsed) ? parsed : seedState();
  } catch {
    return seedState();
  }
}

export function saveState(state: LoftState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用（如隐私模式）时静默失败，界面状态仍在内存中保持一致
  }
}

export function resetState(): LoftState {
  const fresh = seedState();
  saveState(fresh);
  return fresh;
}
