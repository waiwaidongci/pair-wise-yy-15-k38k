// 领域类型：赛鸽训放 + 回棚检疫准入
// 本文件只描述数据结构，不含任何规则与界面逻辑。

export type CheckResult = "正常" | "异常";

export type PigeonRole = "赛鸽" | "种鸽";

export interface Pigeon {
  ring: string; // 足环号，全局唯一
  bloodline: string; // 血统
  role: PigeonRole;
}

export interface TrainingRecord {
  id: string;
  ring: string; // 足环号
  location: string; // 训放地点
  distanceKm: number; // 放飞距离
  weather: string; // 天气
  releasedAt: string; // 放飞时间 ISO
  returnedAt: string | null; // 归巢时间 ISO，null 表示未归巢
  speedMpm: number | null; // 飞行速度 米/分
}

export type QuarantineKind = "入棚检疫" | "复检";

export type QuarantineOutcome = "通过" | "转隔离";

/**
 * 检疫记录（入棚检疫 / 复检）。
 * 更正检疫不改动原记录，而是产生一条 revision+1 的新记录并回填 supersededBy，
 * 因此旧结论永远可查。
 */
export interface QuarantineRecord {
  id: string;
  ring: string;
  trainingId: string | null; // 关联的训放批次（归棚来源）
  kind: QuarantineKind;
  cageNo: string; // 运输笼号
  temperatureC: number; // 体温 ℃
  respiratory: CheckResult; // 呼吸道
  feces: CheckResult; // 粪便
  recordedAt: string; // 登记时间 ISO
  abnormalItems: string[]; // 异常项，如 ["体温", "粪便"]
  outcome: QuarantineOutcome; // 任一异常 => 只能 "转隔离"
  revision: number; // 1 为原始登记，更正后递增
  supersedes: string | null; // 本记录更正了哪条旧记录
  supersededBy: string | null; // 本记录被哪条新记录更正（null = 当前有效）
}

/** 解除隔离事件：隔离满 48 小时且复检正常后才会产生 */
export interface ReleaseEvent {
  id: string;
  ring: string;
  afterRecordId: string; // 对应的隔离触发记录
  recheckId: string; // 依据的复检记录
  releasedAt: string; // 解除时间 ISO
}

/** 持久化到 localStorage 的完整状态 */
export interface LoftState {
  pigeons: Pigeon[];
  trainings: TrainingRecord[];
  quarantines: QuarantineRecord[];
  releases: ReleaseEvent[];
}
