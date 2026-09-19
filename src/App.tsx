import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./state/store";
import { OverviewTab } from "./ui/OverviewTab";
import { ReleaseTab } from "./ui/ReleaseTab";
import { CheckinTab } from "./ui/CheckinTab";
import { RankingTab } from "./ui/RankingTab";
import { ArchiveTab } from "./ui/ArchiveTab";

const TABS = [
  { key: "overview", label: "鸽棚总览" },
  { key: "release", label: "训放上笼" },
  { key: "checkin", label: "回棚检疫" },
  { key: "ranking", label: "成绩排行" },
  { key: "archive", label: "单羽档案" },
];

function Shell() {
  const [tab, setTab] = useState("overview");
  const { resetAll, statuses, db } = useStore();
  const isolatedCount = db.pigeons.filter(
    (p) => statuses.get(p.id)?.status === "isolated"
  ).length;

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">hxyfront-62014 · 赛鸽训放记录</p>
          <h1>赛鸽训放 · 回棚检疫准入</h1>
          <span>
            每羽归棚登记体温、呼吸道、粪便与运输笼，缺项不保存；异常转隔离，同笼入观察，隔离满48小时复检正常恢复。
          </span>
        </div>
        <button
          className="ghost"
          onClick={() => {
            if (window.confirm("将清空当前数据并恢复演示数据，确定？")) resetAll();
          }}
        >
          重置演示数据
        </button>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "checkin" && isolatedCount > 0 && <i className="dot-danger">{isolatedCount}</i>}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab onNavigate={setTab} />}
      {tab === "release" && <ReleaseTab />}
      {tab === "checkin" && <CheckinTab />}
      {tab === "ranking" && <RankingTab />}
      {tab === "archive" && <ArchiveTab />}

      <footer className="app-footer">
        数据保存在本机浏览器（localStorage），刷新后状态一致；状态由检疫事件时间线统一推导，更正检疫后排行、提醒与档案同步重算。
      </footer>
    </main>
  );
}

function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

export default App;
