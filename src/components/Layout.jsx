import { useState } from "react";

// ── Composants archer ─────────────────────────────────────────────────────────
import Saisie          from "./archer/Saisie";
import MesSeances      from "./archer/MesSeances";
import StatsMenusuelles from "./archer/StatsMenusuelles";
import Graphiques      from "./archer/Graphiques";
import MesRecords      from "./archer/MesRecords";

// ── Composants coach ──────────────────────────────────────────────────────────
import Dashboard       from "./coach/Dashboard";
import SeancesArchers  from "./coach/SeancesArchers";
import StatsCoach      from "./coach/StatsCoach";
import Classement      from "./coach/Classement";
import CoachGraph      from "./coach/CoachGraph";
import Objectifs       from "./coach/Objectifs";

// ── Constantes ────────────────────────────────────────────────────────────────

const PRIMARY  = "#FF007A";
const BG       = "#1a1a1a";
const BG_ROW2  = "#141414";

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

// ── Routage des onglets ───────────────────────────────────────────────────────

function renderTab(id) {
  switch (id) {
    // archer
    case "new-session":    return <Saisie />;
    case "my-sessions":   return <MesSeances />;
    case "monthly-stats": return <StatsMenusuelles />;
    case "graphs":        return <Graphiques />;
    case "records":       return <MesRecords />;
    // coach
    case "dashboard":       return <Dashboard />;
    case "archer-sessions": return <SeancesArchers />;
    case "coach-stats":     return <StatsCoach />;
    case "ranking":         return <Classement />;
    case "coach-graphs":    return <CoachGraph />;
    case "objectives":      return <Objectifs />;
    // fallback
    default:
      return (
        <div style={sDefault}>
          Vue <strong style={{ color: "#e8e8e8" }}>{id}</strong> — à venir
        </div>
      );
  }
}

const sDefault = {
  backgroundColor: "#1a1a1a", borderRadius: "10px",
  padding: "48px", textAlign: "center",
  color: "#666", fontSize: "14px",
};

// ── Sous-composants navigation ────────────────────────────────────────────────

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
      display: "flex", alignItems: "center", gap: "5px",
      padding: "0 12px",
      color: active ? PRIMARY : "#555",
      fontSize: "10px", fontWeight: "700",
      textTransform: "uppercase", letterSpacing: "0.1em",
      whiteSpace: "nowrap", userSelect: "none",
      transition: "color 0.15s",
    }}>
      {icon}{label}
    </div>
  );
}

// ── Layout principal ──────────────────────────────────────────────────────────

export default function Layout({ user, isCoach, onLogout }) {
  const [activeTab, setActiveTab] = useState("new-session");

  const activeInArcher = ARCHER_TABS.some((t) => t.id === activeTab);
  const activeInCoach  = COACH_TABS.some((t) => t.id === activeTab);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#111", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Navbar ── */}
      <header style={{ backgroundColor: BG, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>

        {/* Ligne 1 — logo + utilisateur */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "10px 24px",
          borderBottom: "1px solid #2a2a2a",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>🏹</span>
            <span style={{ color: "#fff", fontWeight: "700", fontSize: "15px", letterSpacing: "-0.01em" }}>
              Archers de <span style={{ color: PRIMARY }}>Tinténiac</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ color: "#777", fontSize: "13px" }}>
              {user.prenom} {user.nom}
              {isCoach && (
                <span style={{
                  color: PRIMARY, marginLeft: "8px",
                  fontSize: "10px", fontWeight: "700",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  border: `1px solid ${PRIMARY}`, borderRadius: "4px",
                  padding: "1px 5px",
                }}>
                  Coach
                </span>
              )}
            </span>
            <button
              onClick={onLogout}
              style={{
                background: "none", border: "1px solid #333",
                color: "#777", padding: "5px 13px", borderRadius: "6px",
                fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.target.style.borderColor = "#555"; e.target.style.color = "#bbb"; }}
              onMouseLeave={(e) => { e.target.style.borderColor = "#333"; e.target.style.color = "#777"; }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Ligne 2 — onglets */}
        <div style={{
          display: "flex", alignItems: "stretch",
          backgroundColor: BG_ROW2,
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {/* Groupe Archer */}
          <div style={{ display: "flex", alignItems: "stretch", borderRight: "1px solid #2a2a2a" }}>
            <GroupLabel icon={<TargetIcon />} label="Archer" active={activeInArcher} />
            {ARCHER_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                label={tab.label}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {/* Groupe Coach */}
          {isCoach && (
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <GroupLabel icon={<CoachIcon />} label="Coach" active={activeInCoach} />
              {COACH_TABS.map((tab) => (
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

      {/* ── Contenu ── */}
      <main style={{ padding: "28px 24px" }}>
        {renderTab(activeTab)}
      </main>
    </div>
  );
}
