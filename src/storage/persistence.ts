// 持久化层：只管 localStorage 读写与数据迁移，不包含业务规则。

import type { Database } from "../domain/types";
import { createSeedData } from "./seed";

const STORAGE_KEY = "pigeon-trainer-db-v1";

function isDatabase(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const db = value as Record<string, unknown>;
  return (
    typeof db.version === "number" &&
    Array.isArray(db.pigeons) &&
    Array.isArray(db.sessions) &&
    Array.isArray(db.entries) &&
    Array.isArray(db.checks) &&
    Array.isArray(db.rechecks)
  );
}

export function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isDatabase(parsed)) return parsed;
      console.warn("本地数据格式无法识别，已忽略并重新初始化");
    }
  } catch (err) {
    console.warn("读取本地数据失败：", err);
  }
  return createSeedData(Date.now());
}

export function saveDatabase(db: Database): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn("保存本地数据失败：", err);
  }
}

export function resetDatabase(): Database {
  const seed = createSeedData(Date.now());
  saveDatabase(seed);
  return seed;
}
