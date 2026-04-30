import { useState, lazy, Suspense } from "react";

// ── Imports lazy (chargement à la demande) ────────────────────────────────────
const Saisie           = lazy(() => import("./archer/Saisie"));
const MesSeances       = lazy(() => import("./archer/MesSeances"));
const StatsMenusuelles = lazy(() => import("./archer/StatsMenusuelles"));
const Graphiques       = lazy(() => import("./archer/Graphiques"));
const MesRecords       = lazy(() => import("./archer/MesRecords"));
const Dashboard        = lazy(() => import("./coach/Dashboard"));
const SeancesArchers   = lazy(() => import("./coach/SeancesArchers"));
const StatsCoach       = lazy(() => import("./coach/StatsCoach"));
const Classement       = lazy(() => import("./coach/Classement"));
const CoachGraph       = lazy(() => import("./coach/CoachGraph"));
const Objectifs        = lazy(() => import("./coach/Objectifs"));

// ── Constantes ────────────────────────────────────────────────────────────────

const PRIMARY = "#FF007A";
const BG      = "#1a1a1a";
const BG_SUB  = "#141414";

const ARCHER_TABS = [
  { id: "new-session",    label: "+Séance" },
  { id: "my-sessions",   label: "Mes séances" },
  { id: "monthly-stats", label: "Stats" },
  { id: "graphs",        label: "Graphiques" },
  { id: "records",       label: "Records" },
];

const COACH_TABS = [
  { id: "dashboard",       label: "Tableau de bord" },
  { id: "archer-sessions", label: "Séances archers" },
  { id: "coach-stats",     label: "Stats" },
  { id: "ranking",         label: "Classement" },
  { id: "coach-graphs",    label: "Graphiques" },
  { id: "objectives",      label: "Objectifs" },
];

// ── Rendu des onglets ─────────────────────────────────────────────────────────

function renderTab(id) {
  switch (id) {
    case "new-session":    return <Saisie />;
    case "my-sessions":   return <MesSeances />;
    case "monthly-stats": return <StatsMenusuelles />;
    case "graphs":        return <Graphiques />;
    case "records":       return <MesRecords />;
    case "dashboard":       return <Dashboard />;
    case "archer-sessions": return <SeancesArchers />;
    case "coach-stats":     return <StatsCoach />;
    case "ranking":         return <Classement />;
    case "coach-graphs":    return <CoachGraph />;
    case "objectives":      return <Objectifs />;
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

// ── Layout principal ──────────────────────────────────────────────────────────

export default function Layout({ user, isCoach, onLogout }) {
  const [section,   setSection]   = useState("archer");
  const [activeTab, setActiveTab] = useState("new-session");

  const switchSection = (sec) => {
    setSection(sec);
    if (sec === "archer") setActiveTab("new-session");
    if (sec === "coach")  setActiveTab("dashboard");
  };

  const subTabs = section === "coach" ? COACH_TABS : ARCHER_TABS;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#111", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Navbar ── */}
      <header style={{ backgroundColor: BG, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>

        {/* Ligne 1 — logo + utilisateur */}
        <div className="layout-nav-top">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img src="/TINTENIAC.png" alt="Logo" style={{ height: "32px", width: "auto" }} />
            <span className="layout-nav-title">
              Archers de <span style={{ color: PRIMARY }}>Tinténiac</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span className="layout-nav-username">
              {user.prenom} {user.nom}
              {isCoach && (
                <span style={{
                  color: PRIMARY, marginLeft: "8px",
                  fontSize: "10px", fontWeight: "700",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  border: `1px solid ${PRIMARY}`, borderRadius: "4px",
                  padding: "1px 5px",
                }}>Coach</span>
              )}
            </span>
            <button
              onClick={onLogout}
              style={{
                background: "none", border: "1px solid #333",
                color: "#777", padding: "5px 13px", borderRadius: "6px",
                fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#bbb"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#777"; }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Ligne 2 — sections */}
        <div style={{
          display: "flex", alignItems: "stretch",
          padding: "0 16px", gap: "4px",
          borderBottom: "1px solid #2a2a2a",
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          <SectionBtn label="Archer" active={section === "archer"} onClick={() => switchSection("archer")} />
          {isCoach && (
            <SectionBtn label="Coach" active={section === "coach"} onClick={() => switchSection("coach")} />
          )}
          <a
            href="https://www.archers-de-la-bretagne-romantique.fr/en-savoir-plus/mandat-et-inscription-130102"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px", margin: "auto 0",
              border: "1px solid #2e2e2e", borderRadius: "6px",
              color: "#666", fontSize: "12px", fontWeight: "500",
              textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#bbb"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2e2e2e"; e.currentTarget.style.color = "#666"; }}
          >
            <ExternalLinkIcon /> Inscription concours
          </a>
        </div>

        {/* Ligne 3 — onglets de la section active */}
        <div style={{
          display: "flex", alignItems: "stretch",
          backgroundColor: BG_SUB,
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {subTabs.map((tab) => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

      </header>

      {/* ── Contenu ── */}
      <main className="layout-main">
        <Suspense fallback={<div style={{ color: "#777", fontSize: "14px" }}>Chargement…</div>}>
          {renderTab(activeTab)}
        </Suspense>
      </main>
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function SectionBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none",
        borderBottom: active ? `2px solid ${PRIMARY}` : "2px solid transparent",
        color: active ? "#fff" : "#666",
        padding: "11px 16px 9px",
        fontSize: "13px", fontWeight: active ? "700" : "500",
        cursor: "pointer", whiteSpace: "nowrap",
        transition: "color 0.15s, border-color 0.15s",
        fontFamily: "inherit", letterSpacing: "0.02em",
      }}
    >
      {label}
    </button>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none",
        borderBottom: active ? `2px solid ${PRIMARY}` : "2px solid transparent",
        color: active ? PRIMARY : "#888",
        padding: "10px 14px 8px",
        fontSize: "13px", fontWeight: active ? "600" : "400",
        cursor: "pointer", whiteSpace: "nowrap",
        transition: "color 0.15s, border-color 0.15s",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
