import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { PRIMARY } from "../../../utils/seances";
import BoutonSupprimer from "./BoutonSupprimer";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const VOLEES_PAR_PHASE = 10;

const todayISO = () => new Date().toISOString().split("T")[0];
const flechesParVolee = (distance) => (distance === "5m" || distance === "18m") ? 3 : 6;

const moyenne = (vals) => vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

export default function ExerciceGroupements({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const [volees, setVolees] = useState(existant?.volees ?? []); // [{ phase, cm }]
  const [cm,     setCm]     = useState("");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const phaseActuelle = useMemo(() => {
    const nVisuel = volees.filter((v) => v.phase === "visuel").length;
    return nVisuel < VOLEES_PAR_PHASE ? "visuel" : "cible";
  }, [volees]);

  const { moyVisuel, moyCible } = useMemo(() => ({
    moyVisuel: moyenne(volees.filter((v) => v.phase === "visuel").map((v) => v.cm)),
    moyCible:  moyenne(volees.filter((v) => v.phase === "cible").map((v) => v.cm)),
  }), [volees]);

  const validerVolee = () => {
    const val = parseFloat(cm);
    if (!val || val <= 0) return;
    setVolees((prev) => [...prev, { phase: phaseActuelle, cm: val }]);
    setCm("");
  };

  const annulerDerniere = () => setVolees((prev) => prev.slice(0, -1));

  const handleTerminer = async () => {
    if (volees.length === 0) {
      setError("Ajoutez au moins une volée avant de terminer.");
      return;
    }
    setError("");
    setSaving(true);
    const fpv = flechesParVolee(distance);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "groupements",
      volees,
      groupementCm: moyCible ?? moyVisuel,
      volumePaille: 0,
      volumeBlason: volees.length * fpv,
      volumeCompte: 0,
      score:        0,
      totalFleches: volees.length * fpv,
      moyenne:      null,
      commentaire:  commentaire.trim() || null,
      ...(seanceId ? { seanceId } : {}),
    };
    try {
      if (enEdition) {
        await updateDoc(doc(db, "seances", existant.id), payload);
      } else {
        await addDoc(collection(db, "seances"), { ...payload, createdAt: serverTimestamp() });
      }
      onTermine?.();
    } catch (err) {
      console.error("[ExerciceGroupements] erreur Firestore :", err);
      setError("Erreur lors de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  };

  const handleSupprimer = async () => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, "seances", existant.id));
      onTermine?.();
    } catch (err) {
      console.error("[ExerciceGroupements] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Régularité groupements" : "Régularité groupements"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        {flechesParVolee(distance)} flèches par volée. {VOLEES_PAR_PHASE} volées sur le visuel, puis {VOLEES_PAR_PHASE} sur la cible.
      </p>

      {autonome && (
        <div className="form-grid-4">
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={s.input} />
          </Field>
          <Field label="Distance">
            <select value={distance} onChange={(e) => setDistance(e.target.value)} style={s.input}>
              {DISTANCES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} style={s.input}>
              <option>Entraînement</option>
              <option>Compétition</option>
            </select>
          </Field>
          <Field label="Lieu (optionnel)">
            <input type="text" value={lieu} onChange={(e) => setLieu(e.target.value)} style={s.input} placeholder="ex : Salle Tinténiac" />
          </Field>
        </div>
      )}

      <div style={s.compteurBox}>
        <div style={s.phaseLabel}>Phase actuelle : {phaseActuelle === "visuel" ? "Visuel" : "Cible"}</div>
        <div style={s.moyennes}>
          <span>Visuel : {moyVisuel != null ? `${moyVisuel.toFixed(1)} cm` : "—"}</span>
          <span>Cible : {moyCible != null ? `${moyCible.toFixed(1)} cm` : "—"}</span>
        </div>
      </div>

      <div style={s.saisieRow}>
        <input
          type="number" min="0" step="0.1" value={cm}
          onChange={(e) => setCm(e.target.value)}
          style={s.input} placeholder="Taille du groupement (cm)"
        />
        <button style={s.validerBtn} onClick={validerVolee} disabled={!cm}>+ Volée</button>
      </div>

      {volees.length > 0 && (
        <div style={s.journal}>
          {[...volees].reverse().slice(0, 8).map((v, i) => (
            <span key={volees.length - 1 - i} style={s.journalItem}>
              {v.cm} cm · {v.phase === "visuel" ? "visuel" : "cible"}
            </span>
          ))}
          <button style={s.miniBtn} onClick={annulerDerniere}>Annuler la dernière</button>
        </div>
      )}

      <Field label="Commentaire (optionnel)">
        <input type="text" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} style={s.input} placeholder="Notes, observations…" />
      </Field>

      {error && <div style={s.msgError}>{error}</div>}

      <button style={{ ...s.terminerBtn, ...(saving ? { opacity: 0.6 } : {}) }} onClick={handleTerminer} disabled={saving}>
        {saving ? "Enregistrement…" : enEdition ? "✓ Enregistrer les modifications" : "✓ Terminer l'exercice"}
      </button>

      {enEdition && <BoutonSupprimer onConfirm={handleSupprimer} disabled={saving} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

const s = {
  page: {
    backgroundColor: "var(--surface)", borderRadius: "14px",
    boxShadow: "var(--shadow-card)", padding: "22px",
    display: "flex", flexDirection: "column", gap: "16px",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title:  { fontSize: "18px", fontWeight: "800", color: "var(--text)", margin: 0 },
  annulerBtn: {
    background: "none", border: "1px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "6px", padding: "5px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
  },
  resume: { fontSize: "13px", color: "var(--text-muted)", margin: 0 },

  label: {
    fontSize: "11px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  input: {
    padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "8px",
    fontSize: "14px", color: "var(--text)", outline: "none",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)",
    width: "100%", boxSizing: "border-box",
  },

  compteurBox: {
    backgroundColor: "var(--surface-raised)", borderRadius: "12px",
    border: "1px solid var(--border)", padding: "18px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
  },
  phaseLabel: { fontSize: "15px", fontWeight: "700", color: PRIMARY },
  moyennes: { display: "flex", gap: "16px", fontSize: "13px", color: "var(--text-muted)" },

  saisieRow: { display: "flex", gap: "10px" },
  validerBtn: {
    backgroundColor: PRIMARY, color: "#fff", border: "none",
    borderRadius: "8px", padding: "0 20px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  },

  journal: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  journalItem: {
    fontSize: "11px", color: "var(--text-dim)",
    backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)",
    borderRadius: "6px", padding: "3px 8px",
  },
  miniBtn: {
    background: "none", border: "1px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "6px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit",
  },

  msgError: {
    backgroundColor: "rgba(255,0,122,0.1)", border: `1px solid ${PRIMARY}`, borderRadius: "8px",
    padding: "10px 14px", fontSize: "13px", color: PRIMARY,
  },
  terminerBtn: {
    backgroundColor: "#16a34a", color: "#fff", border: "none",
    borderRadius: "10px", padding: "14px", fontSize: "15px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
};
