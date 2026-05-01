import { useState, useEffect, lazy, Suspense } from "react";
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

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
  { id: "records",       label: "Mes records" },
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
  const [section,        setSection]        = useState("archer");
  const [activeTab,      setActiveTab]      = useState("new-session");
  const [showChangePwd,  setShowChangePwd]  = useState(false);
  const [pendingResets,  setPendingResets]  = useState(0);

  useEffect(() => {
    if (!isCoach) return;
    const q = query(collection(db, "password_resets"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => setPendingResets(snap.size));
    return () => unsub();
  }, [isCoach]);

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
            {!isCoach && (
              <button
                onClick={() => setShowChangePwd(true)}
                title="Changer le mot de passe"
                style={{
                  background: "none", border: "1px solid #333",
                  color: "#777", padding: "5px 8px", borderRadius: "6px",
                  fontSize: "14px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#bbb"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#777"; }}
              >
                🔑
              </button>
            )}
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
              padding: "6px 14px", margin: "auto 0",
              border: "1.5px solid #444", borderRadius: "6px",
              color: "#ccc", fontSize: "12px", fontWeight: "600",
              textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit",
              backgroundColor: "#1e1e1e",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#FF007A"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.backgroundColor = "rgba(255,0,122,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#ccc"; e.currentTarget.style.backgroundColor = "#1e1e1e"; }}
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
              badge={tab.id === "dashboard" && pendingResets > 0 ? pendingResets : 0}
            />
          ))}
        </div>

      </header>

      {/* ── Modale changement mot de passe ── */}
      {showChangePwd && (
        <ChangePasswordModal user={user} onClose={() => setShowChangePwd(false)} />
      )}

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

function ChangePasswordModal({ user, onClose }) {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!current || !next || !confirm) { setError("Veuillez remplir tous les champs."); return; }
    if (next !== confirm)              { setError("Les nouveaux mots de passe ne correspondent pas."); return; }
    if (next.length < 6)               { setError("Le nouveau mot de passe doit faire au moins 6 caractères."); return; }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", user.id));
      if (!snap.exists() || snap.data().mdp !== toBase64(current)) {
        setError("Mot de passe actuel incorrect.");
        setLoading(false);
        return;
      }
      await updateDoc(doc(db, "users", user.id), { mdp: toBase64(next) });
      setSuccess(true);
    } catch {
      setError("Erreur lors de la mise à jour. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={sModal.overlay} onClick={onClose}>
      <div style={sModal.card} onClick={e => e.stopPropagation()}>
        <div style={sModal.header}>
          <span style={sModal.title}>Changer le mot de passe</span>
          <button style={sModal.close} onClick={onClose}>✕</button>
        </div>

        {success ? (
          <div style={sModal.successMsg}>
            ✓ Mot de passe mis à jour avec succès.
            <button style={sModal.doneBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {[
              { label: "Mot de passe actuel",       val: current,  set: setCurrent  },
              { label: "Nouveau mot de passe",       val: next,     set: setNext     },
              { label: "Confirmer le nouveau",       val: confirm,  set: setConfirm  },
            ].map(({ label, val, set }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={sModal.label}>{label}</label>
                <input
                  type="password"
                  value={val}
                  onChange={e => { set(e.target.value); setError(""); }}
                  style={sModal.input}
                  className="login-input"
                />
              </div>
            ))}
            {error && <div style={sModal.errorMsg}>{error}</div>}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={sModal.cancelBtn}>Annuler</button>
              <button type="submit" disabled={loading} style={{ ...sModal.submitBtn, ...(loading ? { opacity: 0.6 } : {}) }}>
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const sModal = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 200,
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "16px",
  },
  card: {
    backgroundColor: "#1a1a1a", borderRadius: "14px",
    padding: "24px", width: "100%", maxWidth: "360px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    display: "flex", flexDirection: "column", gap: "18px",
  },
  header:  { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title:   { fontSize: "15px", fontWeight: "700", color: "#e8e8e8" },
  close:   { background: "none", border: "none", color: "#666", fontSize: "16px", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" },
  label:   { fontSize: "11px", fontWeight: "600", color: "#777", textTransform: "uppercase", letterSpacing: "0.07em" },
  input:   { padding: "10px 12px", border: "1.5px solid #2e2e2e", borderRadius: "8px", fontSize: "14px", color: "#e8e8e8", backgroundColor: "#252525", outline: "none", fontFamily: "inherit" },
  errorMsg:   { backgroundColor: "rgba(255,0,122,0.1)", border: "1px solid #FF007A", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#FF007A" },
  successMsg: { backgroundColor: "rgba(22,163,74,0.12)", border: "1px solid #16a34a", borderRadius: "8px", padding: "14px", fontSize: "13px", color: "#16a34a", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" },
  doneBtn:    { background: "none", border: "1px solid #16a34a", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", color: "#16a34a", cursor: "pointer", fontFamily: "inherit" },
  cancelBtn:  { background: "none", border: "1px solid #333", borderRadius: "7px", padding: "8px 16px", fontSize: "13px", color: "#aaa", cursor: "pointer", fontFamily: "inherit" },
  submitBtn:  { backgroundColor: "#FF007A", color: "#fff", border: "none", borderRadius: "7px", padding: "8px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" },
};

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

function TabBtn({ label, active, onClick, badge }) {
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
        position: "relative", display: "inline-flex", alignItems: "center", gap: "6px",
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{
          backgroundColor: "#ef4444",
          color: "#fff",
          fontSize: "10px", fontWeight: "700",
          borderRadius: "10px",
          padding: "1px 5px",
          lineHeight: "1.4",
          minWidth: "16px", textAlign: "center",
        }}>
          {badge}
        </span>
      )}
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
