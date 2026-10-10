import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { callAdminFunction } from "../../utils/adminApi";
import { PRIMARY } from "../../utils/seances";

// Gestion des comptes, réservée aux coachs (onglet Archers) : création d'un
// archer et demandes de nouveau mot de passe envoyées depuis l'écran de connexion.

const normAp  = (s) => s.replace(/['`´ʼ'ʹ]/g, "'");
const toDocId = (prenom, nom) =>
  normAp(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`).replace(/\s+/g, "_");

// Demandes de mot de passe en attente (la pastille de l'onglet Archers est
// calculée de son côté dans Layout).
function useDemandesMotDePasse() {
  const [demandes, setDemandes] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "password_resets"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => setDemandes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);
  return demandes;
}

// ── Demandes de nouveau mot de passe ──────────────────────────────────────────

export function DemandesMotDePasse() {
  const demandes = useDemandesMotDePasse();
  const [nouveaux, setNouveaux] = useState({});
  const [etat,     setEtat]     = useState({});

  // Demande inutile (doublon, erreur de nom, déjà réglée autrement) : on la retire.
  const supprimer = async (req) => {
    if (!window.confirm(`Supprimer la demande de ${req.prenom} ${req.nom} ?`)) return;
    try {
      await deleteDoc(doc(db, "password_resets", req.id));
    } catch (err) {
      console.error("[DemandesMotDePasse] suppression :", err);
      setEtat((prev) => ({ ...prev, [req.id]: "error" }));
    }
  };

  const valider = async (req) => {
    const pwd = (nouveaux[req.id] || "").trim();
    if (pwd.length < 6) return;
    setEtat((prev) => ({ ...prev, [req.id]: "loading" }));
    try {
      await callAdminFunction("admin-reset-password", { uid: req.archerId, password: pwd });
      await updateDoc(doc(db, "password_resets", req.id), { status: "done" });
      setEtat((prev) => ({ ...prev, [req.id]: "done" }));
      setNouveaux((prev) => ({ ...prev, [req.id]: "" }));
    } catch {
      setEtat((prev) => ({ ...prev, [req.id]: "error" }));
    }
  };

  if (demandes.length === 0) return null;

  return (
    <div style={s.section}>
      <div style={s.entete}>
        <span style={s.titre}>Demandes de mot de passe</span>
        <span style={s.badge}>{demandes.length}</span>
      </div>
      {demandes.map((req) => (
        <div key={req.id} style={s.ligne}>
          <span style={s.nom}>{req.prenom} {req.nom}</span>
          <div style={s.actions}>
            <input
              type="text"
              placeholder="Nouveau mot de passe (6 car. min)"
              value={nouveaux[req.id] || ""}
              onChange={(e) => setNouveaux((prev) => ({ ...prev, [req.id]: e.target.value }))}
              style={s.input}
            />
            <button
              style={{ ...s.valider, ...(etat[req.id] === "loading" ? { opacity: 0.6 } : {}) }}
              onClick={() => valider(req)}
              disabled={etat[req.id] === "loading" || (nouveaux[req.id] || "").trim().length < 6}
            >
              {etat[req.id] === "done" ? "✓" : etat[req.id] === "loading" ? "…" : "Valider"}
            </button>
            <button
              style={s.supprimer}
              onClick={() => supprimer(req)}
              disabled={etat[req.id] === "loading"}
              title="Supprimer la demande"
              aria-label={`Supprimer la demande de ${req.prenom} ${req.nom}`}
            >✕</button>
          </div>
          {etat[req.id] === "error" && (
            <span style={{ fontSize: "11px", color: "var(--bad)" }}>Erreur — archer introuvable ?</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Création d'un archer ──────────────────────────────────────────────────────

export function NouvelArcherModal({ onClose }) {
  const [prenom,  setPrenom]  = useState("");
  const [nom,     setNom]     = useState("");
  const [pwd,     setPwd]     = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!prenom.trim() || !nom.trim()) { setError("Prénom et nom obligatoires."); return; }
    if (!pwd || pwd.length < 6)        { setError("Mot de passe trop court (6 caractères min)."); return; }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", toDocId(prenom, nom)));
      if (snap.exists()) {
        setError(`Un archer "${prenom.trim()} ${nom.trim()}" existe déjà.`);
        setLoading(false);
        return;
      }
      await callAdminFunction("admin-create-archer", { prenom: prenom.trim(), nom: nom.trim(), password: pwd });
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Erreur lors de la création. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "8px",
    fontSize: "14px", color: "var(--text)", backgroundColor: "var(--input-bg)",
    outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={sModal.overlay} onClick={onClose}>
      <div style={sModal.card} onClick={(e) => e.stopPropagation()}>
        <div style={sModal.header}>
          <span style={sModal.title}>Nouvel archer</span>
          <button style={sModal.close} onClick={onClose}>✕</button>
        </div>

        {success ? (
          <div style={sModal.success}>
            <span>✓ Archer créé avec succès.</span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={sModal.secondaryBtn} onClick={() => { setPrenom(""); setNom(""); setPwd(""); setSuccess(false); }}>
                Créer un autre
              </button>
              <button style={sModal.primaryBtn} onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="na-prenom" style={sModal.label}>Prénom</label>
                <input id="na-prenom" type="text" value={prenom} onChange={(e) => { setPrenom(e.target.value); setError(""); }}
                  style={inputStyle} placeholder="Margot" autoFocus />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="na-nom" style={sModal.label}>Nom</label>
                <input id="na-nom" type="text" value={nom} onChange={(e) => { setNom(e.target.value); setError(""); }}
                  style={inputStyle} placeholder="Trevilly" />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label htmlFor="na-pwd" style={sModal.label}>Mot de passe (6 car. min)</label>
              <input id="na-pwd" type="text" value={pwd} onChange={(e) => { setPwd(e.target.value); setError(""); }}
                style={inputStyle} placeholder="Mot de passe initial" />
            </div>
            {error && <div style={sModal.error}>{error}</div>}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={sModal.secondaryBtn}>Annuler</button>
              <button type="submit" disabled={loading}
                style={{ ...sModal.primaryBtn, ...(loading ? { opacity: 0.6 } : {}) }}>
                {loading ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const sModal = {
  overlay:      { position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
  card:         { backgroundColor: "var(--surface)", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "400px", boxShadow: "var(--shadow-modal)", display: "flex", flexDirection: "column", gap: "18px" },
  header:       { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title:        { fontFamily: "var(--display)", fontSize: "16px", fontWeight: "600", color: "var(--text)" },
  close:        { background: "none", border: "none", color: "var(--text-dim)", fontSize: "16px", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit" },
  label:        { fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" },
  error:        { backgroundColor: "var(--bad-soft)", border: "1px solid var(--bad)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "var(--bad)" },
  success:      { backgroundColor: "var(--good-soft)", border: "1px solid var(--good)", borderRadius: "8px", padding: "14px", fontSize: "13px", color: "var(--good)", display: "flex", flexDirection: "column", gap: "12px" },
  primaryBtn:   { backgroundColor: PRIMARY, color: "#fff", border: "none", borderRadius: "7px", padding: "8px 20px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" },
  secondaryBtn: { background: "none", border: "1px solid var(--border-3)", borderRadius: "7px", padding: "8px 16px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
};

const s = {
  section: {
    backgroundColor: "var(--surface)", border: "1px solid var(--warn)", borderRadius: "12px",
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "var(--shadow-card)",
  },
  entete: { display: "flex", alignItems: "center", gap: "10px" },
  titre:  { fontSize: "13px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em" },
  badge:  { backgroundColor: "var(--warn)", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: "700" },
  ligne: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px",
    paddingTop: "10px", borderTop: "1px solid var(--border)",
  },
  nom:     { fontSize: "14px", color: "var(--text)", fontWeight: "600", flex: "1 1 120px" },
  actions: { display: "flex", gap: "8px", flex: "2 1 240px" },
  input: {
    flex: 1, padding: "7px 10px", border: "1.5px solid var(--border-2)", borderRadius: "7px",
    fontSize: "13px", color: "var(--text)", backgroundColor: "var(--input-bg)", outline: "none", fontFamily: "inherit",
  },
  valider: {
    backgroundColor: "var(--warn)", color: "#fff", border: "none", borderRadius: "7px", padding: "7px 14px",
    fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  },
  supprimer: {
    background: "none", border: "1px solid var(--border-3)", borderRadius: "7px",
    color: "var(--text-muted)", padding: "0 10px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
  },
};
