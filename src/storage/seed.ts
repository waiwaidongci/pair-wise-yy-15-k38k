// 演示数据：全部以“当前时间”为基准生成，保证隔离倒计时/48小时规则可直观验证。

import type { Database } from "../domain/types";
import { calcSpeed, uid } from "../domain/rules";

const HOUR = 3600_000;
const MIN = 60_000;

export function createSeedData(now: number): Database {
  // 两次训放：6 天前固安 80km（短距离），2 天前衡水 180km（中距离）
  const s1Release = now - 6 * 24 * HOUR;
  const s2Release = now - 2 * 24 * HOUR + 2 * HOUR;

  const db: Database = {
    version: 1,
    pigeons: [
      { id: "p1", ringNo: "CHN-24-001839", bloodline: "詹森系", role: "赛鸽", gender: "雄" },
      { id: "p2", ringNo: "CHN-24-002114", bloodline: "凡龙系", role: "赛鸽", gender: "雌" },
      { id: "p3", ringNo: "CHN-24-003207", bloodline: "詹森系", role: "赛鸽", gender: "雌" },
      { id: "p4", ringNo: "CHN-24-004561", bloodline: "盖比系", role: "赛鸽", gender: "雄" },
      { id: "p5", ringNo: "CHN-24-005882", bloodline: "凡龙系", role: "赛鸽", gender: "雌" },
      { id: "p6", ringNo: "CHN-23-008771", bloodline: "盖比系", role: "赛鸽", gender: "雄", pairingNote: "原种鸽，2026 春季转为赛训" },
      { id: "p7", ringNo: "CHN-24-006120", bloodline: "詹森系", role: "赛鸽", gender: "雄" },
      { id: "p8", ringNo: "CHN-24-007345", bloodline: "胡本系", role: "赛鸽", gender: "雌" },
      { id: "p9", ringNo: "CHN-24-008902", bloodline: "胡本系", role: "赛鸽", gender: "雄" },
      { id: "p10", ringNo: "CHN-23-009003", bloodline: "凡龙系", role: "种鸽", gender: "雌", pairingNote: "配对 p6（已拆）" },
    ],
    sessions: [],
    entries: [],
    checks: [],
    rechecks: [],
  };

  // ---- 第一次训放：固安 80km ----
  const s1 = uid("ses");
  db.sessions.push({
    id: s1,
    location: "固安",
    distanceKm: 80,
    weather: "晴，南风2级",
    releaseTime: s1Release,
    cageAssignments: { A1: ["p1", "p3", "p4"], A2: ["p2", "p5", "p6"], A3: ["p7", "p10"] },
  });

  const s1Return: Record<string, { mins: number; temp: number; resp?: 0 | 1; feces?: 0 | 1; cage?: 0 | 1; note?: string }> = {
    p1: { mins: 68, temp: 41.2 },
    p2: { mins: 74, temp: 41.4 },
    p3: { mins: 70, temp: 41.0 },
    p4: { mins: 82, temp: 41.6 },
    p5: { mins: 76, temp: 41.1 },
    // p6：体温异常 -> 隔离；5 天后复检正常，隔离已满 48h -> 已恢复
    p6: { mins: 95, temp: 42.9, note: "归巢即闭眼炸毛" },
    p7: { mins: 80, temp: 40.9 },
    // p10 种鸽随行，未归
  };

  for (const [pid, info] of Object.entries(s1Return)) {
    const cage =
      pid === "p1" || pid === "p3" || pid === "p4"
        ? "A1"
        : pid === "p2" || pid === "p5"
          ? "A2"
          : pid === "p6"
            ? "A2"
            : "A3";
    const checkTime = s1Release + info.mins * MIN;
    db.entries.push({
      id: uid("ent"),
      sessionId: s1,
      pigeonId: pid,
      cageNo: cage,
      returned: true,
      returnTime: checkTime,
      speedMpm: calcSpeed(80, s1Release, checkTime),
    });
    db.checks.push({
      id: uid("chk"),
      pigeonId: pid,
      sessionId: s1,
      cageNo: cage,
      temperature: info.temp,
      respiratory: info.resp === 1 ? "abnormal" : "normal",
      feces: info.feces === 1 ? "abnormal" : "normal",
      cageCondition: info.cage === 1 ? "abnormal" : "normal",
      note: info.note,
      checkTime,
      // 演示“更正留痕”：p6 体温由 43.1 更正为 42.9，旧结论保留
      revisions:
        pid === "p6"
          ? [
              {
                revisedAt: checkTime + 3 * HOUR,
                reason: "体温计读数笔误，重新核对后更正",
                snapshot: {
                  temperature: 43.1,
                  respiratory: "normal",
                  feces: "normal",
                  cageCondition: "normal",
                  cageNo: "A2",
                },
              },
            ]
          : [],
    });
  }
  db.entries.push({ id: uid("ent"), sessionId: s1, pigeonId: "p10", cageNo: "A3", returned: false });

  // p6 复检：隔离第 3 天，四项正常，满 48h -> 恢复（早于第二次训放，上笼合规）
  db.rechecks.push({
    id: uid("rck"),
    pigeonId: "p6",
    checkId: db.checks.find((c) => c.pigeonId === "p6")!.id,
    temperature: 41.1,
    respiratory: "normal",
    feces: "normal",
    cageCondition: "normal",
    note: "隔离第3日复检，状态恢复",
    checkTime: s1Release + 3 * 24 * HOUR,
  });

  // ---- 第二次训放：衡水 180km（2 天前，隔离计时进行中） ----
  const s2 = uid("ses");
  db.sessions.push({
    id: s2,
    location: "衡水",
    distanceKm: 180,
    weather: "多云，侧风3级",
    releaseTime: s2Release,
    cageAssignments: {
      A1: ["p1", "p3", "p4", "p9"],
      A2: ["p5", "p6"],
      B1: ["p2", "p7"],
      B2: ["p8"],
    },
  });

  const s2Return: Record<string, { mins: number; temp: number; resp?: 0 | 1; feces?: 0 | 1; cage?: 0 | 1; note?: string }> = {
    p1: { mins: 150, temp: 41.3 },
    p3: { mins: 156, temp: 41.0 },
    p4: { mins: 162, temp: 41.5 },
    p9: { mins: 170, temp: 41.2 },
    p5: { mins: 158, temp: 41.1 },
    p6: { mins: 168, temp: 41.0 },
    p7: { mins: 175, temp: 41.4 },
    // p2：呼吸道异常 -> 隔离中（未满 48h），有一次正常复检但仍拦截
    p2: { mins: 148, temp: 41.3, resp: 1, note: "张口呼吸，有啰音" },
    // p8：粪便异常 -> 隔离中，尚无复检
    p8: { mins: 180, temp: 41.2, feces: 1, note: "稀便带绿" },
  };

  const cageOf: Record<string, string> = {
    p1: "A1", p3: "A1", p4: "A1", p9: "A1",
    p5: "A2", p6: "A2",
    p2: "B1", p7: "B1",
    p8: "B2",
  };

  for (const [pid, info] of Object.entries(s2Return)) {
    const checkTime = s2Release + info.mins * MIN;
    db.entries.push({
      id: uid("ent"),
      sessionId: s2,
      pigeonId: pid,
      cageNo: cageOf[pid],
      returned: true,
      returnTime: checkTime,
      speedMpm: calcSpeed(180, s2Release, checkTime),
    });
    db.checks.push({
      id: uid("chk"),
      pigeonId: pid,
      sessionId: s2,
      cageNo: cageOf[pid],
      temperature: info.temp,
      respiratory: info.resp === 1 ? "abnormal" : "normal",
      feces: info.feces === 1 ? "abnormal" : "normal",
      cageCondition: info.cage === 1 ? "abnormal" : "normal",
      note: info.note,
      checkTime,
      revisions: [],
    });
  }

  // p2 在隔离约 30 小时时复检四项正常（未满 48h，仍隔离、仍拦截）
  db.rechecks.push({
    id: uid("rck"),
    pigeonId: "p2",
    checkId: db.checks.filter((c) => c.pigeonId === "p2").slice(-1)[0].id,
    temperature: 41.0,
    respiratory: "normal",
    feces: "normal",
    cageCondition: "normal",
    note: "症状减轻，继续隔离观察",
    checkTime: s2Release + 30 * HOUR,
  });

  return db;
}
