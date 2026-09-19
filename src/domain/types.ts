// 领域模型：赛鸽训放 + 回棚检疫
// 该文件只定义数据结构，不包含规则计算与存储逻辑。

export type HealthSign = "normal" | "abnormal";

/** 回棚检疫四项：体温、呼吸道、粪便、运输笼 */
export interface QuarantineCheck {
  id: string;
  pigeonId: string;
  sessionId: string;
  /** 运输笼编号，用于确定同笼接触鸽 */
  cageNo: string;
  /** 体温（摄氏度），赛鸽正常区间约 40.0~42.5 */
  temperature: number;
  respiratory: HealthSign;
  feces: HealthSign;
  /** 运输笼卫生/状况检查 */
  cageCondition: HealthSign;
  note?: string;
  checkTime: number;
  /** 更正留痕：每次更正保存一条旧结论快照，旧结论可查 */
  revisions: CheckRevision[];
}

export interface CheckRevision {
  revisedAt: number;
  reason: string;
  snapshot: {
    temperature: number;
    respiratory: HealthSign;
    feces: HealthSign;
    cageCondition: HealthSign;
    cageNo: string;
    note?: string;
  };
}

export interface Recheck {
  id: string;
  pigeonId: string;
  checkId: string;
  temperature: number;
  respiratory: HealthSign;
  feces: HealthSign;
  cageCondition: HealthSign;
  note?: string;
  checkTime: number;
}

export interface Pigeon {
  id: string;
  ringNo: string;
  bloodline: string;
  /** 种鸽 / 赛鸽 */
  role: "赛鸽" | "种鸽";
  gender: "雄" | "雌";
  pairingNote?: string;
}

export interface TrainSession {
  id: string;
  location: string;
  /** 空距 km */
  distanceKm: number;
  weather: string;
  releaseTime: number;
  /** 运输笼编号 -> 笼内足环号，用于同笼判定 */
  cageAssignments: Record<string, string[]>;
}

/** 一羽鸽在一次训放中的参赛/归巢记录 */
export interface Entry {
  id: string;
  sessionId: string;
  pigeonId: string;
  cageNo: string;
  /** 已归巢（已完成回棚登记） */
  returned: boolean;
  returnTime?: number;
  speedMpm?: number;
}

export interface Database {
  version: number;
  pigeons: Pigeon[];
  sessions: TrainSession[];
  entries: Entry[];
  checks: QuarantineCheck[];
  rechecks: Recheck[];
}

/** 鸽只当前状态，完全由检疫事件推导 */
export type QuarantineStatus =
  | "normal" // 正常
  | "isolated" // 隔离
  | "observation"; // 观察（同笼接触）

export interface StatusInfo {
  status: QuarantineStatus;
  /** 人类可读的状态说明 */
  reason: string;
  /** 隔离开始时间（异常检疫时间） */
  isolatedAt?: number;
  /** 隔离满 48 小时的时间点 */
  recoverableAt?: number;
  /** 已有的复检（按时间升序） */
  rechecks: Recheck[];
  /** 关联的异常检疫记录 */
  sourceCheck?: QuarantineCheck;
  /** 观察来源：哪羽隔离鸽、哪次检疫、同笼编号 */
  exposedBy?: { pigeonId: string; checkId: string; cageNo: string };
}

export interface RankingRow {
  pigeonId: string;
  ringNo: string;
  bloodline: string;
  sessions: number;
  returned: number;
  /** 排除隔离期间成绩后的归巢率 */
  homingRate: number;
  avgSpeed: number | null;
  excludedEntries: number;
}

export interface UnreturnedRow {
  pigeonId: string;
  ringNo: string;
  sessionId: string;
  location: string;
  distanceKm: number;
  releaseTime: number;
  blocked: boolean;
  blockReason?: string;
}
