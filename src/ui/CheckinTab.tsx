import { useState } from "react";
import { useStore } from "../state/store";
import {
  abnormalReasons,
  isAbnormal,
  releaseBlocker,
  TEMP_MAX,
  TEMP_MIN,
  type CheckInput,
} from "../domain/rules";
import type { QuarantineCheck } from "../domain/types";
import { fmtCountdown, fmtDateTime, statusTitle } from "./format";
import { EmptyState, Panel, StatusBadge } from "./components";
import { QuarantineForm } from "./QuarantineForm";

export function CheckinTab() {
  const { db, now, statuses } = useStore();
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [recheckPigeon, setRecheckPigeon] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const pending = db.entries
    .filter((e) => !e.returned)
    .sort((a, b) => {
      const sa = db.sessions.find((s) => s.id === a.sessionId)!;
      const sb = db.sessions.find((s) => s.id === b.sessionId)!;
      return sb.releaseTime - sa.releaseTime;
    });
  const isolated = db.pigeons.filter((p) => statuses.get(p.id)?.status === "isolated");
  const checks = [...db.checks].sort((a, b) => b.checkTime - a.checkTime);

  const flash = (r: { ok: boolean; error?: string }) => {
    setToast(r.ok ? { ok: true, text: "已保存，排行、提醒和单羽档案已同步重算" } : { ok: false, text: r.error ?? "保存失败" });
  };

  return (
    <div className="tab-grid">
      {toast && (
        <div className={`toast ${toast.ok ? "ok" : "err"}`} onClick={() => setToast(null)}>
          {toast.ok ? "✓ " : "⚠ "}
          {toast.text}
          <button className="link-btn">关闭</button>
        </div>
      )}

      <Panel title="待归巢登记" hint="体温 / 呼吸道 / 粪便 / 运输笼，缺项不保存">
        {pending.length === 0 ? (
          <EmptyState text="暂无待登记的归巢鸽" />
        ) : (
          <div className="cards">
            {pending.map((entry) => {
              const pigeon = db.pigeons.find((p) => p.id === entry.pigeonId)!;
              const session = db.sessions.find((s) => s.id === entry.sessionId)!;
              return (
                <article key={entry.id} className="bird-card">
                  <header>
                    <div>
                      <h3 className="mono">{pigeon.ringNo}</h3>
                      <p>
                        {pigeon.bloodline} · {session.location} {session.distanceKm}km · 笼 {entry.cageNo}
                      </p>
                    </div>
                  </header>
                  <button className="primary" onClick={() => setActiveEntry(entry.id)}>
                    登记回棚检疫
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="隔离鸽 · 复检" hint="隔离满48小时且四项正常复检才恢复">
        {isolated.length === 0 ? (
          <EmptyState text="当前没有隔离鸽" />
        ) : (
          <div className="cards">
            {isolated.map((p) => {
              const info = statuses.get(p.id)!;
              const remain = (info.recoverableAt ?? now) - now;
              const afterStart = info.rechecks.filter((r) => r.checkTime >= (info.isolatedAt ?? 0));
              const latest = afterStart.at(-1);
              return (
                <article key={p.id} className="bird-card danger">
                  <header>
                    <div>
                      <h3 className="mono">{p.ringNo}</h3>
                      <p>{statusTitle(db, info, now)}</p>
                    </div>
                    <StatusBadge status="isolated" />
                  </header>
                  <p className="line">
                    隔离进度：{fmtCountdown(remain)}
                    {latest ? (
                      <> · 最近复检 {isAbnormal(latest) ? "异常（重新计时）" : "四项正常"}</>
                    ) : (
                      " · 尚未复检"
                    )}
                  </p>
                  <p className="block-note">⛔ {releaseBlocker(info, now).warning}</p>
                  <button onClick={() => setRecheckPigeon(p.id)}>登记复检</button>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="检疫记录与更正" hint="更正后排行/提醒/档案重算，旧结论可查">
        <table className="table">
          <thead>
            <tr>
              <th>足环号</th>
              <th>训放</th>
              <th>笼</th>
              <th>体温</th>
              <th>呼吸</th>
              <th>粪便</th>
              <th>笼况</th>
              <th>结论</th>
              <th>时间</th>
              <th>留痕</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => {
              const pigeon = db.pigeons.find((p) => p.id === check.pigeonId)!;
              const session = db.sessions.find((s) => s.id === check.sessionId)!;
              const abnormal = isAbnormal(check);
              return (
                <tr key={check.id} className={abnormal ? "row-abnormal" : ""}>
                  <td className="mono">{pigeon.ringNo}</td>
                  <td>{session.location}</td>
                  <td>{check.cageNo}</td>
                  <td>{check.temperature.toFixed(1)}℃</td>
                  <SignCell v={check.respiratory} />
                  <SignCell v={check.feces} />
                  <SignCell v={check.cageCondition} />
                  <td>
                    {abnormal ? (
                      <span className="text-danger">异常：{abnormalReasons(check).join("、")}</span>
                    ) : (
                      <span className="text-ok">正常</span>
                    )}
                  </td>
                  <td>{fmtDateTime(check.checkTime)}</td>
                  <td>{check.revisions.length > 0 ? `已更正${check.revisions.length}次` : "—"}</td>
                  <td>
                    <button className="link-btn" onClick={() => setCorrecting(check.id)}>
                      更正
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {activeEntry && (
        <Modal title="回棚检疫登记" onClose={() => setActiveEntry(null)}>
          <CheckinForm
            entryId={activeEntry}
            onDone={(r) => {
              flash(r);
              if (r.ok) setActiveEntry(null);
            }}
          />
        </Modal>
      )}
      {recheckPigeon && (
        <Modal title="隔离复检登记" onClose={() => setRecheckPigeon(null)}>
          <RecheckForm
            pigeonId={recheckPigeon}
            onDone={(r) => {
              flash(r);
              if (r.ok) setRecheckPigeon(null);
            }}
          />
        </Modal>
      )}
      {correcting && (
        <Modal title="更正检疫记录" onClose={() => setCorrecting(null)} wide>
          <CorrectionForm
            check={db.checks.find((c) => c.id === correcting)!}
            onDone={(r) => {
              flash(r);
              if (r.ok) setCorrecting(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function SignCell({ v }: { v: "normal" | "abnormal" }) {
  return v === "normal" ? <td className="text-ok">正常</td> : <td className="text-danger">异常</td>;
}

function CheckinForm({
  entryId,
  onDone,
}: {
  entryId: string;
  onDone: (r: { ok: boolean; error?: string }) => void;
}) {
  const { db, saveCheck } = useStore();
  const entry = db.entries.find((e) => e.id === entryId)!;
  const pigeon = db.pigeons.find((p) => p.id === entry.pigeonId)!;
  const session = db.sessions.find((s) => s.id === entry.sessionId)!;
  return (
    <div>
      <p className="modal-sub">
        <b className="mono">{pigeon.ringNo}</b> · {session.location} {session.distanceKm}km · 运输笼 {entry.cageNo}
      </p>
      <QuarantineForm
        title="四项检疫（缺项不保存）"
        defaultTime={Date.now()}
        initial={{ cageNo: entry.cageNo }}
        submitLabel="保存回棚登记"
        onSubmit={(input) => saveCheck(entryId, input)}
      />
    </div>
  );
}

function RecheckForm({
  pigeonId,
  onDone,
}: {
  pigeonId: string;
  onDone: (r: { ok: boolean; error?: string }) => void;
}) {
  const { db, saveRecheck } = useStore();
  const pigeon = db.pigeons.find((p) => p.id === pigeonId)!;
  const latestCheck = [...db.checks].filter((c) => c.pigeonId === pigeonId).at(-1)!;
  return (
    <div>
      <p className="modal-sub">
        <b className="mono">{pigeon.ringNo}</b> · 复检四项正常且隔离满48小时，状态自动恢复
      </p>
      <QuarantineForm
        title="复检四项"
        defaultTime={Date.now()}
        requireCage={false}
        submitLabel="保存复检"
        onSubmit={(input) => saveRecheck(pigeonId, latestCheck.id, input)}
      />
    </div>
  );
}

function CorrectionForm({
  check,
  onDone,
}: {
  check: QuarantineCheck;
  onDone: (r: { ok: boolean; error?: string }) => void;
}) {
  const { saveCorrection } = useStore();
  return (
    <div>
      {check.revisions.length > 0 && (
        <div className="revision-box">
          <h4>旧结论（可查）</h4>
          {check.revisions.map((rev, i) => (
            <div key={i} className="revision-item">
              <p>
                {fmtDateTime(rev.revisedAt)} · 更正原因：{rev.reason}
              </p>
              <p>
                体温 {rev.snapshot.temperature.toFixed(1)}℃（正常 {TEMP_MIN.toFixed(1)}~
                {TEMP_MAX.toFixed(1)}）· 呼吸道{zh(rev.snapshot.respiratory)} · 粪便
                {zh(rev.snapshot.feces)} · 运输笼{zh(rev.snapshot.cageCondition)} · 笼 {rev.snapshot.cageNo}
              </p>
            </div>
          ))}
        </div>
      )}
      <QuarantineForm
        title="按复核结果更正（保存当前结论）"
        defaultTime={check.checkTime}
        requireReason
        initial={{
          cageNo: check.cageNo,
          temperature: check.temperature,
          respiratory: check.respiratory,
          feces: check.feces,
          cageCondition: check.cageCondition,
          note: check.note ?? "",
        }}
        submitLabel="保存更正并重算"
        onSubmit={(input: CheckInput, reason: string) =>
          saveCorrection(check.id, reason, input)
        }
      />
    </div>
  );
}

function zh(v: "normal" | "abnormal") {
  return v === "normal" ? "正常" : "异常";
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="link-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
