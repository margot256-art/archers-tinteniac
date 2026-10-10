import { useState, useEffect, useRef } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, sansAttendreLeServeur } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from "../../../utils/brouillonExercice";
import { getPaille, getBlason, getCompte, todayISO } from "../../../utils/seances";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

// Saisie d'une séance après coup, en un seul formulaire (volumes + score),
// sans passer par la saisie en direct des exercices.
// `seanceInfo` : la saisie fait partie d'une séance à plusieurs exercices — la
// date, la distance, le type et le lieu se modifient alors au niveau de la séance.
export default function SaisieManuelle({ existant, seanceInfo, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const enEdition = !!existant;
  const autonome  = !seanceInfo;

  // Formulaire interrompu (retour à l'accueil, appli fermée…) : on reprend le brouillon.
  const saisie = { protocole: "manuel", existantId: existant?.id };
  const [brouillon] = useState(() => lireBrouillon(user?.id, saisie));

  const [date,     setDate]     = useState(brouillon?.date ?? existant?.date ?? todayISO());
  const [distance, setDistance] = useState(brouillon?.distance ?? existant?.distance ?? "18m");
  const [type,     setType]     = useState(brouillon?.type ?? existant?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(brouillon?.lieu ?? existant?.lieu ?? "");
  const [paille,   setPaille]   = useState(brouillon?.paille ?? (existant ? String(getPaille(existant) || "") : ""));
  const [blason,   setBlason]   = useState(brouillon?.blason ?? (existant ? String(getBlason(existant) || "") : ""));
  const [compte,   setCompte]   = useState(brouillon?.compte ?? (existant ? String(getCompte(existant) || "") : ""));
  const [score,    setScore]    = useState(brouillon?.score ?? (existant?.score ? String(existant.score) : ""));
  // Une saisie manuelle est une séance entière : son commentaire est le commentaire
  // de séance (les anciennes saisies l'avaient en commentaire d'exercice).
  const [commentaire, setCommentaire] = useState(brouillon?.commentaire ?? existant?.commentaireSeance ?? existant?.commentaire ?? "");

  // Brouillon écrit dès le premier changement ; un nouveau formulaire vide n'a rien à reprendre.
  const ouverture = useRef(true);
  useEffect(() => {
    if (ouverture.current) { ouverture.current = false; return; }
    if (!enEdition && !paille && !blason && !compte && !score && !commentaire.trim() && !lieu.trim()) {
      effacerBrouillon(user?.id, saisie);
      return;
    }
    ecrireBrouillon(user?.id, saisie, { date, distance, type, lieu, paille, blason, compte, score, commentaire });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `saisie` et `enEdition` sont fixes pour la vie de l'écran
  }, [user?.id, date, distance, type, lieu, paille, blason, compte, score, commentaire]);

  const quitter = (callback) => { effacerBrouillon(user?.id, saisie); callback?.(); };

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
      // Rattachée à une séance à plusieurs exercices, le commentaire se modifie au
      // niveau de la séance (Journal) : on n'y touche pas ici.
      ...(autonome ? { commentaireSeance: commentaire.trim() || null, commentaire: null } : {}),
    };
    try {
      if (enEdition) {
        sansAttendreLeServeur(updateDoc(doc(db, "seances", existant.id), payload), "SaisieManuelle");
      } else {
        sansAttendreLeServeur(addDoc(collection(db, "seances"), { ...payload, createdAt: serverTimestamp() }), "SaisieManuelle");
      }
      quitter(onTermine);
    } catch (e) {
      console.error("[SaisieManuelle] erreur Firestore :", e);
      setError("Erreur lors de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  };

  const handleSupprimer = async () => {
    setSaving(true);
    try {
      sansAttendreLeServeur(deleteDoc(doc(db, "seances", existant.id)), "SaisieManuelle");
      quitter(onTermine);
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
        <button style={s.annulerBtn} onClick={() => quitter(onAnnuler)}>✕ Annuler</button>
      </div>
      <p style={s.resume}>Notez une séance après coup : nombre de flèches et score, en une fois.</p>

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

      {autonome && (
        <Field label="Commentaire de séance (optionnel)">
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            style={s.textarea} rows={3}
            placeholder="Ressenti général, conditions, points travaillés…"
          />
        </Field>
      )}

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
