// 状态管理层：连接规则层（纯函数）与持久化层（localStorage），对界面暴露动作。
// 不在此处写任何状态判定规则，也不直接操作 DOM。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Database, StatusInfo } from "../domain/types";
import {
  addRecheck,
  correctCheck,
  createSession,
  deriveAllStatuses,
  registerCheck,
  releaseBlocker,
  type CheckInput,
  type Result,
} from "../domain/rules";
import { loadDatabase, resetDatabase, saveDatabase } from "../storage/persistence";

type ActionResult = { ok: boolean; error?: string };

interface StoreValue {
  db: Database;
  now: number;
  statuses: Map<string, StatusInfo>;
  saveCheck: (entryId: string, input: CheckInput) => ActionResult;
  saveRecheck: (pigeonId: string, checkId: string, input: CheckInput) => ActionResult;
  saveCorrection: (checkId: string, reason: string, patch: CheckInput) => ActionResult;
  saveSession: (params: {
    location: string;
    distanceKm: number;
    weather: string;
    releaseTime: number;
    cages: { cageNo: string; pigeonIds: string[] }[];
  }) => ActionResult;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function apply(result: Result): Database | string {
  return result.ok ? result.data : result.error;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => loadDatabase());
  const [now, setNow] = useState(() => Date.now());

  // 倒计时等时间相关显示每 30 秒刷新；规则本身以传入时间戳为准
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const statuses = useMemo(() => deriveAllStatuses(db, now), [db, now]);

  const commit = useCallback((result: Result): ActionResult => {
    const value = apply(result);
    if (typeof value === "string") return { ok: false, error: value };
    setDb(value);
    saveDatabase(value);
    return { ok: true };
  }, []);

  const saveCheck = useCallback(
    (entryId: string, input: CheckInput) =>
      commit(registerCheck(db, { entryId, input })),
    [db, commit]
  );

  const saveRecheck = useCallback(
    (pigeonId: string, checkId: string, input: CheckInput) =>
      commit(addRecheck(db, { pigeonId, checkId, input })),
    [db, commit]
  );

  const saveCorrection = useCallback(
    (checkId: string, reason: string, patch: CheckInput) =>
      commit(correctCheck(db, { checkId, reason, patch })),
    [db, commit]
  );

  const saveSession = useCallback(
    (params: {
      location: string;
      distanceKm: number;
      weather: string;
      releaseTime: number;
      cages: { cageNo: string; pigeonIds: string[] }[];
    }) => {
      const blocks = new Map(
        db.pigeons.map((p) => [p.id, releaseBlocker(statuses.get(p.id)!, now)])
      );
      return commit(createSession(db, params, blocks, now));
    },
    [db, now, statuses, commit]
  );

  const resetAll = useCallback(() => {
    const fresh = resetDatabase();
    setDb(fresh);
    setNow(Date.now());
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ db, now, statuses, saveCheck, saveRecheck, saveCorrection, saveSession, resetAll }),
    [db, now, statuses, saveCheck, saveRecheck, saveCorrection, saveSession, resetAll]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
