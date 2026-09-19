import { useState } from "react";
import "./styles.css";
import { useLoft } from "./data/useLoft";
import { MetricsBar } from "./components/MetricsBar";
import { QuarantineForm } from "./components/QuarantineForm";
import { TrainingForm } from "./components/TrainingForm";
import { IsolationPanel } from "./components/IsolationPanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { RankingPanel } from "./components/RankingPanel";
import { DirectoryPanel } from "./components/DirectoryPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { QuarantineLog } from "./components/QuarantineLog";

const project = {
  sourceNo: 9,
  id: "hxyfront-62014",
  port: 62014,
  title: "赛鸽训放记录",
};

function App() {
  const loft = useLoft();
  const { state, now } = loft;
  const [selectedRing, setSelectedRing] = useState<string | null>(null);

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>
          回棚检疫准入已启用：每羽归棚须登记体温、呼吸道、粪便与运输笼，缺项不保存；
          任一异常只能转隔离，同笼鸽转入观察并保留原记录；隔离满 48
          小时且复检正常方可恢复，未恢复前训放一律拦截并说明原因。
        </span>
      </section>

      <MetricsBar state={state} />

      <section className="workspace">
        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>回棚检疫</p>
              <h2>入棚检疫登记</h2>
            </div>
          </div>
          <QuarantineForm
            state={state}
            kind="入棚检疫"
            submitLabel="保存检疫记录"
            onSubmit={loft.registerQuarantine}
          />
        </section>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>训放管理</p>
              <h2>新增训放记录</h2>
            </div>
          </div>
          <TrainingForm state={state} now={now} onSubmit={loft.addTraining} />
        </section>
      </section>

      <section className="workspace">
        <IsolationPanel
          state={state}
          now={now}
          onRecheck={loft.registerQuarantine}
          onRelease={loft.releaseIsolation}
        />
        <AlertsPanel state={state} now={now} onMarkReturned={loft.markReturned} />
      </section>

      <RankingPanel state={state} />

      <section className="workspace">
        <DirectoryPanel state={state} selectedRing={selectedRing} onSelect={setSelectedRing} />
        <ProfilePanel state={state} ring={selectedRing} />
      </section>

      <QuarantineLog state={state} onCorrect={loft.correctQuarantine} />

      <footer className="footer">
        <button className="ghost" onClick={loft.reset}>
          恢复演示数据
        </button>
        <span>状态规则 / 持久化 / 界面分层实现，数据保存在本地，刷新后保持一致。</span>
      </footer>
    </main>
  );
}

export default App;
