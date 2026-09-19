import type { ReactNode } from "react";
import type { StatusInfo } from "../domain/types";
import { STATUS_LABEL } from "./format";

export function StatusBadge({ status }: { status: StatusInfo["status"] }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Panel({
  title,
  hint,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          {hint && <p>{hint}</p>}
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
