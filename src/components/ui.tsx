// 界面共享小组件与格式化工具（纯展示，不含规则）

import type { PigeonStatus } from "../domain/rules";

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 输入框需要的本地时间格式 */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StatusBadge({ status }: { status: PigeonStatus }) {
  if (status.kind === "隔离中") {
    return <span className="badge badge-danger">隔离中</span>;
  }
  if (status.kind === "观察中") {
    return <span className="badge badge-warn">观察中</span>;
  }
  return <span className="badge badge-ok">正常</span>;
}

export function Notice({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p className={result.ok ? "notice notice-ok" : "notice notice-error"} role="status">
      {result.message}
    </p>
  );
}
