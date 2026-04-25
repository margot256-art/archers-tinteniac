import { useState } from "react";

const PRIMARY = "#FF007A";
const BG = "#1a1a1a";
const BG_ROW2 = "#141414";

const ARCHER_TABS = [
  { id: "new-session",    label: "+Séance" },
  { id: "my-sessions",   label: "Mes séances" },
  { id: "monthly-stats", label: "Stats mensuelles" },
  { id: "graphs",        label: "Graphiques" },
  { id: "records",       label: "Mes records" },
];

const COACH_TABS = [
  { id: "dashboard",       label: "Tableau de bord" },
  { id: "archer-sessions", label: "Séances archers" },
  { id: "coach-stats",     label: "Stats" },
  { id: "ranking",         label: "Classement" },
  { id: "coach-graphs",    label: "Coach-Graph" },
  { id: "objectives",      label: "Objectifs" },
];

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? `2px solid ${PRIMARY}` : "2px solid transparent",
        color: active ? PRIMARY : "#999",
        padding: "13px 14px 11px",
        fontSize: "13px",
        fontWeight: active ? "600" : "400",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 0.15s, border-color 0.15s",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ icon, label, active }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "5px",
      padding: "0 12px",
      color: active ? PRIMARY : "#555",
      fontSize: "10px",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      whiteSpace: "nowrap",
      userSelect: "none",
      transition: "color 0.15s",
    }}>
      {icon}
      {label}
    </div>
  );
}

export default function Layout({ user, isCoach, onLogout, children }) {
  const [activeTab, setActiveTab] = useState("new-session");

  const activeInCoach = COACH_TABS.some(t => t.id === activeTab);
  const activeInArcher = ARCHER_TABS.some(t => t.id === activeTab);

  const allTabs = [...ARCHER_TABS, ...(isCoach ? COACH_TABS : [])];
  const activeLabel = allTabs.find(t => t.id === activeTab)?.label ?? "";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f0f0", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Navbar */}
      <header style={{ backgroundColor: BG, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>

        {/* Row 1 — logo + user */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 24px",
          borderBottom: "1px solid #2a2a2a",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>🏹</span>
            <span style={{ color: "#fff", fontWeight: "700", fontSize: "15px", letterSpacing: "-0.01em" }}>
              Archers de{" "}
              <span style={{ color: PRIMARY }}>Tinténiac</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ color: "#777", fontSize: "13px" }}>
              {user.prenom} {user.nom}
              {isCoach && (
                <span style={{
                  color: PRIMARY,
                  marginLeft: "8px",
                  fontSize: "10px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  border: `1px solid ${PRIMARY}`,
                  borderRadius: "4px",
                  padding: "1px 5px",
                }}>
                  Coach
                </span>
              )}
            </span>
            <button
              onClick={onLogout}
              style={{
                background: "none",
                border: "1px solid #333",
                color: "#777",
                padding: "5px 13px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#555"; e.target.style.color = "#bbb"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#333"; e.target.style.color = "#777"; }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Row 2 — tabs */}
        <div style={{
          display: "flex",
          alignItems: "stretch",
          backgroundColor: BG_ROW2,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}>

          {/* Archer group */}
          <div style={{ display: "flex", alignItems: "stretch", borderRight: "1px solid #2a2a2a" }}>
            <GroupLabel icon={<TargetIcon />} label="Archer" active={activeInArcher} />
            {ARCHER_TABS.map(tab => (
              <TabButton
                key={tab.id}
                label={tab.label}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {/* Coach group */}
          {isCoach && (
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <GroupLabel icon={<CoachIcon />} label="Coach" active={activeInCoach} />
              {COACH_TABS.map(tab => (
                <TabButton
                  key={tab.id}
                  label={tab.label}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: "28px 24px" }}>
        {typeof children === "function"
          ? children(activeTab)
          : children ?? (
            <div style={{
              backgroundColor: "#fff",
              borderRadius: "10px",
              padding: "48px",
              textAlign: "center",
              color: "#aaa",
              fontSize: "14px",
            }}>
              Vue <strong style={{ color: "#333" }}>{activeLabel}</strong> — à venir
            </div>
          )
        }
      </main>
    </div>
  );
}
