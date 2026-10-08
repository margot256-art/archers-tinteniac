import { useState, useEffect, lazy, Suspense, memo } from "react";
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PRIMARY as PINK } from "../utils/seances";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

// ── Imports lazy (chargement à la demande) ─────────────────────────────────
const Accueil         = lazy(() => import("./archer/Accueil"));
const SeanceTab       = lazy(() => import("./archer/SeanceTab"));
const Journal         = lazy(() => import("./archer/Journal"));
const Progression     = lazy(() => import("./archer/Progression"));
const MesRecords      = lazy(() => import("./archer/MesRecords"));
const Dashboard       = lazy(() => import("./coach/Dashboard"));
const SeancesArchers  = lazy(() => import("./coach/SeancesArchers"));
const StatsCoach      = lazy(() => import("./coach/StatsCoach"));
const Classement      = lazy(() => import("./coach/Classement"));
const CoachGraph      = lazy(() => import("./coach/CoachGraph"));
const Objectifs       = lazy(() => import("./coach/Objectifs"));

// "new-session" n'est volontairement pas dans cette liste : ce n'est pas un
// onglet, on y arrive uniquement via le bouton "+ Nouvelle séance" de l'Accueil.
const ARCHER_TABS = [
  { id: "accueil",     label: "Accueil" },
  { id: "journal",     label: "Journal" },
  { id: "progression", label: "Progression" },
  { id: "records",     label: "Records" },
];

const COACH_TABS = [
  { id: "dashboard",       label: "Tableau de bord" },
  { id: "archer-sessions", label: "Séances archers" },
  { id: "coach-stats",     label: "Stats" },
  { id: "ranking",         label: "Classement" },
  { id: "coach-graphs",    label: "Graphiques" },
  { id: "objectives",      label: "Objectifs" },
];

function renderTab(id, { onAllerNewSession } = {}) {
  switch (id) {
    case "accueil":         return <Accueil onReprendre={onAllerNewSession} onNouvelleSeance={onAllerNewSession} />;
    case "new-session":     return <SeanceTab />;
    case "journal":         return <Journal />;
    case "progression":     return <Progression />;
    case "records":         return <MesRecords />;
    case "dashboard":       return <Dashboard />;
    case "archer-sessions": return <SeancesArchers />;
    case "coach-stats":     return <StatsCoach />;
    case "ranking":         return <Classement />;
    case "coach-graphs":    return <CoachGraph />;
    case "objectives":      return <Objectifs />;
    default:
      return <div style={sDefault}>Vue <strong style={{ color: "var(--text)" }}>{id}</strong> — à venir</div>;
  }
}

const sDefault = {
  backgroundColor: "var(--surface)", borderRadius: "14px",
  padding: "48px", textAlign: "center",
  color: "var(--text-dim)", fontSize: "14px",
};

// ── Layout principal ─────────────────────────────────────────────────────

export default function Layout({ user, isCoach, onLogout, theme, toggleTheme }) {
  const [section,       setSection]       = useState("archer");
  const [activeTab,     setActiveTab]     = useState("accueil");
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pendingResets, setPendingResets] = useState(0);

  useEffect(() => {
    if (!isCoach) return;
    const q = query(collection(db, "password_resets"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => setPendingResets(snap.size));
    return () => unsub();
  }, [isCoach]);

  const switchSection = (sec) => {
    setSection(sec);
    setActiveTab(sec === "coach" ? "dashboard" : "accueil");
  };

  const subTabs = section === "coach" ? COACH_TABS : ARCHER_TABS;
  const enSeance = activeTab === "new-session";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--app-bg)", display: "flex", flexDirection: "column" }}>

      <header style={{ backgroundColor: "var(--surface)", position: "sticky", top: 0, zIndex: 100, boxShadow: "var(--shadow-nav)", borderBottom: "1px solid var(--border)" }}>

        {/* Ligne 1 — logo + utilisateur */}
        <div className="layout-nav-top">
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <img src="/TINTENIAC.png" alt="" style={{ height: "34px", width: "34px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-2)" }} />
            <span className="layout-nav-title">
              Archers de <span style={{ color: PINK }}>Tinténiac</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="layout-nav-username">
              {user.prenom} {user.nom}
              {isCoach && (
                <span style={{
                  color: PINK, marginLeft: "8px",
                  fontSize: "10px", fontWeight: "700",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  border: `1px solid ${PINK}`, borderRadius: "4px",
                  padding: "1px 5px",
                }}>Coach</span>
              )}
            </span>
            <IconBtn onClick={toggleTheme} title={theme === "dark" ? "Mode clair" : "Mode sombre"}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </IconBtn>
            {!isCoach && (
              <IconBtn onClick={() => setShowChangePwd(true)} title="Changer le mot de passe">🔑</IconBtn>
            )}
            <button
              onClick={onLogout}
              style={{
                background: "none", border: "1px solid var(--border-3)",
                color: "var(--text-muted)", padding: "6px 14px", borderRadius: "7px",
                fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {enSeance ? (
          /* ── En plein milieu d'une séance : juste un retour, pas d'onglets ── */
          <div style={{ padding: "10px 24px", borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => setActiveTab("accueil")}
              style={{
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: "var(--text-muted)", fontSize: "13px", padding: 0,
              }}
            >
              ← Retour à l'accueil
            </button>
          </div>
        ) : (
          <>
            {/* Ligne 2 — section (archer/coach) */}
            <div role="tablist" aria-label="Section" style={{
              display: "flex", alignItems: "stretch", padding: "0 20px", gap: "4px",
              borderBottom: "1px solid var(--border)", overflowX: "auto", scrollbarWidth: "none",
            }}>
              <SectionBtn label="Archer" active={section === "archer"} onClick={() => switchSection("archer")} />
              {isCoach && <SectionBtn label="Coach" active={section === "coach"} onClick={() => switchSection("coach")} />}
              <a
                href="https://www.archers-de-la-bretagne-romantique.fr/en-savoir-plus/mandat-et-inscription-130102"
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "6px 13px", margin: "auto 0",
                  border: "1px solid var(--border-3)", borderRadius: "7px",
                  color: "var(--text-dim)", fontSize: "11.5px", fontWeight: "600",
                  textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit",
                }}
              >
                <ExternalLinkIcon /> Inscription concours
              </a>
            </div>

            {/* Ligne 3 — onglets */}
            <div role="tablist" aria-label="Onglets" style={{
              display: "flex", alignItems: "stretch", backgroundColor: "var(--surface-sub)",
              overflowX: "auto", scrollbarWidth: "none", padding: "0 12px",
            }}>
              {subTabs.map((tab) => (
                <TabBtn
                  key={tab.id} label={tab.label}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  badge={tab.id === "dashboard" && pendingResets > 0 ? pendingResets : 0}
                />
              ))}
            </div>
          </>
        )}
      </header>

      {showChangePwd && (
        <ChangePasswordModal user={user} onClose={() => setShowChangePwd(false)} />
      )}

      <main role="tabpanel" className="layout-main">
        <Suspense fallback={<div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Chargement…</div>}>
          {renderTab(activeTab, { onAllerNewSession: () => setActiveTab("new-session") })}
        </Suspense>
      </main>
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────

const IconBtn = memo(function IconBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        background: "none", border: "1px solid var(--border-3)",
        color: "var(--text-muted)", padding: "6px 9px", borderRadius: "7px",
        fontSize: "14px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
});

function ChangePasswordModal({ user, onClose }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

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
              { label: "Mot de passe actuel",  id: "cpwd-current", val: current, set: setCurrent },
              { label: "Nouveau mot de passe", id: "cpwd-next",    val: next,    set: setNext },
              { label: "Confirmer le nouveau", id: "cpwd-confirm", val: confirm, set: setConfirm },
            ].map(({ label, id, val, set }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor={id} style={sModal.label}>{label}</label>
                <input id={id} type="password" value={val}
                  onChange={e => { set(e.target.value); setError(""); }}
                  style={sModal.input} className="login-input" />
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
  overlay: { position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
  card: { backgroundColor: "var(--surface)", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "360px", boxShadow: "var(--shadow-modal)", display: "flex", flexDirection: "column", gap: "18px", border: "1px solid var(--border)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: "var(--display)", fontSize: "16px", fontWeight: "600", color: "var(--text)" },
  close: { background: "none", border: "none", color: "var(--text-dim)", fontSize: "16px", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" },
  label: { fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" },
  input: { padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "8px", fontSize: "14px", color: "var(--text)", backgroundColor: "var(--input-bg)", outline: "none", fontFamily: "inherit" },
  errorMsg: { backgroundColor: "var(--pink-soft)", border: `1px solid ${PINK}`, borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: PINK },
  successMsg: { backgroundColor: "rgba(63,160,111,0.14)", border: "1px solid var(--good)", borderRadius: "8px", padding: "14px", fontSize: "13px", color: "var(--good)", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" },
  doneBtn: { background: "none", border: "1px solid var(--good)", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", color: "var(--good)", cursor: "pointer", fontFamily: "inherit" },
  cancelBtn: { background: "none", border: "1px solid var(--border-3)", borderRadius: "7px", padding: "8px 16px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
  submitBtn: { backgroundColor: PINK, color: "#fff", border: "none", borderRadius: "7px", padding: "8px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" },
};

const SectionBtn = memo(function SectionBtn({ label, active, onClick }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      style={{
        background: "none", border: "none",
        borderBottom: active ? `2px solid ${PINK}` : "2px solid transparent",
        color: active ? "var(--text)" : "var(--text-dim)",
        padding: "11px 14px 9px", fontSize: "13px", fontWeight: active ? "700" : "500",
        cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", letterSpacing: "0.02em",
      }}
    >
      {label}
    </button>
  );
});

const TabBtn = memo(function TabBtn({ label, active, onClick, badge }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      style={{
        background: "none", border: "none",
        borderBottom: active ? `2px solid ${PINK}` : "2px solid transparent",
        color: active ? PINK : "var(--text-muted)",
        padding: "11px 14px 9px", fontSize: "13px", fontWeight: active ? "600" : "400",
        cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: "6px",
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{ backgroundColor: "var(--bad)", color: "#fff", fontSize: "10px", fontWeight: "700", borderRadius: "10px", padding: "1px 5px", lineHeight: "1.4", minWidth: "16px", textAlign: "center" }}>
          {badge}
        </span>
      )}
    </button>
  );
});

const ExternalLinkIcon = memo(function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
});

const SunIcon = memo(function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
});

const MoonIcon = memo(function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
});
