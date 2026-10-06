import { useState } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { PRIMARY, normFactor } from "../../../utils/seances";
import BoutonSupprimer from "./BoutonSupprimer";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const todayISO = () => new Date().toISOString().split("T")[0];

export default function ExerciceTirCompte({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");

  const [volumePaille, setVolumePaille] = useState(existant ? String(existant.volumePaille ?? 0) : "");
  const [volumeBlason, setVolumeBlason] = useState(existant ? String(existant.volumeBlason ?? 0) : "");
  const [volumeCompte, setVolumeCompte] = useState(existant ? String(existant.volumeCompte ?? 0) : "");
  const [score,        setScore]        = useState(existant ? String(existant.score ?? 0) : "");
  const [commentaire,  setCommentaire]  = useState(existant?.commentaire ?? "");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const paille = parseInt(volumePaille) || 0;
  const blason = parseInt(volumeBlason) || 0;
  const compte = parseInt(volumeCompte) || 0;
  const sc     = parseInt(score)        || 0;
  const totalFleches = paille + blason + compte;
  const moyenne       = compte > 0 ? sc / compte : null;
  const base           = normFactor(distance);

  const handleTerminer = async () => {
    if (totalFleches === 0) {
      setError("Veuillez saisir au moins un volume de flèches.");
      return;
    }
    if (sc > 0 && compte === 0) {
      setError("Un score nécessite un volume de tir compté.");
      return;
    }
    if (sc > compte * 10 && compte > 0) {
      setError(`Score trop élevé : maximum possible = ${compte * 10} (${compte} flèches × 10).`);
      return;
    }
    setError("");
    setSaving(true);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "tir-compte",
      volumePaille: paille,
      volumeBlason: blason,
      volumeCompte: compte,
      score:        sc,
      totalFleches,
      moyenne:      moyenne !== null ? parseFloat(moyenne.toFixed(2)) : null,
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
      console.error("[ExerciceTirCompte] erreur Firestore :", err);
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
      console.error("[ExerciceTirCompte] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Tir compté" : "Tir compté"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>Score sur un nombre de flèches comptées.</p>

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

      <div className="form-grid-4">
        <Field label="Vol. paille">
          <input type="number" min="0" value={volumePaille} onChange={(e) => setVolumePaille(e.target.value)} style={s.input} placeholder="0" />
        </Field>
        <Field label="Vol. blason">
          <input type="number" min="0" value={volumeBlason} onChange={(e) => setVolumeBlason(e.target.value)} style={s.input} placeholder="0" />
        </Field>
        <Field label="Vol. tir compté">
          <input type="number" min="0" value={volumeCompte} onChange={(e) => setVolumeCompte(e.target.value)} style={s.input} placeholder="0" />
        </Field>
        <Field label="Score">
          <input type="number" min="0" value={score} onChange={(e) => setScore(e.target.value)} style={s.input} placeholder="0" />
        </Field>
      </div>

      <div style={s.compteurBox}>
        <div style={s.compteurTotal}>{sc || "—"}</div>
        <div style={s.compteurLabel}>
          {totalFleches} fl.{moyenne !== null && ` · moy. ${moyenne.toFixed(2)} · ≈ ${Math.round(moyenne * base)} sur ${base}`}
        </div>
      </div>

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
    border: "1px solid var(--border)", padding: "20px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "6px", alignItems: "center",
  },
  compteurTotal: { fontSize: "36px", fontWeight: "800", color: PRIMARY, lineHeight: 1, letterSpacing: "-0.02em" },
  compteurLabel: { fontSize: "13px", color: "var(--text-muted)" },

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
