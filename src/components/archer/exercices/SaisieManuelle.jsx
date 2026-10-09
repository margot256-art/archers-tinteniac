import { useState } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { getPaille, getBlason, getCompte } from "../../../utils/seances";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const todayISO = () => new Date().toISOString().split("T")[0];

// Saisie d'une séance après coup, en un seul formulaire (volumes + score),
// sans passer par la saisie en direct des exercices.
export default function SaisieManuelle({ existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? "");
  const [paille,   setPaille]   = useState(existant ? String(getPaille(existant) || "") : "");
  const [blason,   setBlason]   = useState(existant ? String(getBlason(existant) || "") : "");
  const [compte,   setCompte]   = useState(existant ? String(getCompte(existant) || "") : "");
  const [score,    setScore]    = useState(existant?.score ? String(existant.score) : "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const p  = parseInt(paille) || 0;
  const b  = parseInt(blason) || 0;
  const c  = parseInt(compte) || 0;
  const sc = parseInt(score)  || 0;

  const valider = () => {
    if (!date) return "La date est requise.";
    if (date > todayISO()) return "La date ne peut pas être dans le futur.";
    if (p + b + c === 0) return "Saisissez au moins un nombre de flèches.";
    if (sc > 0 && c === 0) return "Un score nécessite des flèches comptées.";
    if (c > 0 && sc > c * 10) return `Score trop élevé : maximum possible = ${c * 10} (${c} flèches × 10).`;
    return "";
  };

  const handleEnregistrer = async () => {
    const err = valider();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "manuel",
      volumePaille: p,
      volumeBlason: b,
      volumeCompte: c,
      score:        sc,
      totalFleches: p + b + c,
      moyenne:      c > 0 && sc > 0 ? parseFloat((sc / c).toFixed(2)) : null,
      commentaire:  commentaire.trim() || null,
    };
    try {
      if (enEdition) {
        await updateDoc(doc(db, "seances", existant.id), payload);
      } else {
        await addDoc(collection(db, "seances"), { ...payload, createdAt: serverTimestamp() });
      }
      onTermine?.();
    } catch (e) {
      console.error("[SaisieManuelle] erreur Firestore :", e);
      setError("Erreur lors de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  };

  const handleSupprimer = async () => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, "seances", existant.id));
      onTermine?.();
    } catch (e) {
      console.error("[SaisieManuelle] erreur suppression :", e);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  const nombre = (valeur, setValeur) => (
    <input
      type="number" min="0" inputMode="numeric"
      value={valeur}
      onChange={(e) => { setValeur(e.target.value); setError(""); }}
      style={s.input} placeholder="0"
    />
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Saisie manuelle" : "Saisie manuelle"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>Notez une séance après coup : nombre de flèches et score, en une fois.</p>

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

      <div className="form-grid-4">
        <Field label="Flèches paille">{nombre(paille, setPaille)}</Field>
        <Field label="Flèches blason">{nombre(blason, setBlason)}</Field>
        <Field label="Flèches comptées">{nombre(compte, setCompte)}</Field>
        <Field label="Score (si compté)">{nombre(score, setScore)}</Field>
      </div>

      {p + b + c > 0 && (
        <p style={s.resume}>
          Total : <strong>{p + b + c} flèches</strong>
          {c > 0 && sc > 0 && <> · moyenne {(sc / c).toFixed(2)} / flèche</>}
        </p>
      )}

      <Field label="Commentaire (optionnel)">
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          style={s.textarea} rows={3}
          placeholder="Ressenti général, conditions, points travaillés…"
        />
      </Field>

      {error && <div style={s.msgError}>{error}</div>}

      <button style={{ ...s.terminerBtn, ...(saving ? { opacity: 0.6 } : {}) }} onClick={handleEnregistrer} disabled={saving}>
        {saving ? "Enregistrement…" : enEdition ? "✓ Enregistrer les modifications" : "✓ Enregistrer la séance"}
      </button>

      {enEdition && <BoutonSupprimer onConfirm={handleSupprimer} disabled={saving} label="la séance" />}
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
  ...exerciceStyles,
  textarea: { ...exerciceStyles.input, resize: "vertical", minHeight: "70px", lineHeight: 1.4 },
};
