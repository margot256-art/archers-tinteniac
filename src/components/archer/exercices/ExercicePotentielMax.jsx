import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { normFactor } from "../../../utils/seances";
import { pointsZone } from "../../../utils/blason";
import ZoneButtons from "./ZoneButtons";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const MIN_FLECHES = 3;
const MAX_FLECHES = 6;
const COMPTEES    = 3;

const todayISO = () => new Date().toISOString().split("T")[0];

function meilleur3(codes) {
  return [...codes].sort((a, b) => pointsZone(b) - pointsZone(a)).slice(0, COMPTEES);
}
const scoreVolee = (codes) => meilleur3(codes).reduce((s, c) => s + pointsZone(c), 0);

export default function ExercicePotentielMax({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const [volees,       setVolees]       = useState(existant?.volees ?? []); // [[code, code, ...], ...]
  const [voleeEnCours, setVoleeEnCours] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const base = normFactor(distance);

  const { cumul, flechesTirees, comptees, projection } = useMemo(() => {
    const cumul         = volees.reduce((s, v) => s + scoreVolee(v), 0);
    const flechesTirees = volees.reduce((s, v) => s + v.length, 0);
    const comptees       = volees.length * COMPTEES;
    const moyenneComptee = comptees ? cumul / comptees : null;
    return {
      cumul, flechesTirees, comptees,
      projection: moyenneComptee != null ? Math.round(moyenneComptee * base) : null,
    };
  }, [volees, base]);

  const ajouterFleche = (code) => {
    if (voleeEnCours.length >= MAX_FLECHES) return;
    setVoleeEnCours((prev) => [...prev, code]);
  };

  const validerVolee = () => {
    if (voleeEnCours.length < MIN_FLECHES) return;
    setVolees((prev) => [...prev, voleeEnCours]);
    setVoleeEnCours([]);
  };

  const annulerVolee = () => setVoleeEnCours([]);

  const handleTerminer = async () => {
    const finales = voleeEnCours.length >= MIN_FLECHES ? [...volees, voleeEnCours] : volees;
    if (finales.length === 0) {
      setError(`Ajoutez au moins une volée de ${MIN_FLECHES} flèches avant de terminer.`);
      return;
    }
    const cumulFinal   = finales.reduce((s, v) => s + scoreVolee(v), 0);
    const flechesFinal = finales.reduce((s, v) => s + v.length, 0);

    setError("");
    setSaving(true);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "potentiel-max",
      volees:       finales,
      volumePaille: 0,
      volumeBlason: 0,
      volumeCompte: flechesFinal,
      score:        cumulFinal,
      totalFleches: flechesFinal,
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
      console.error("[ExercicePotentielMax] erreur Firestore :", err);
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
      console.error("[ExercicePotentielMax] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Potentiel Max" : "Potentiel Max"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        {MIN_FLECHES} flèches minimum par volée, {MAX_FLECHES - MIN_FLECHES} bonus maximum. Seules les {COMPTEES} meilleures comptent.
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
        <div style={s.compteurTotal}>{projection ?? "—"}</div>
        <div style={s.compteurLabel}>
          projection sur {base} fl. · {cumul} pts, {comptees} fl. comptées · {flechesTirees} fl. tirées · {volees.length} volée{volees.length > 1 ? "s" : ""}
        </div>
      </div>

      <div style={s.voleeEnCoursBox}>
        <div style={s.voleeEnCoursHead}>
          <span>Volée en cours — {voleeEnCours.length} flèche{voleeEnCours.length > 1 ? "s" : ""}</span>
          {voleeEnCours.length > 0 && <button style={s.miniBtn} onClick={annulerVolee}>Vider</button>}
        </div>
        <ZoneButtons onPress={ajouterFleche} disabled={voleeEnCours.length >= MAX_FLECHES} />
        {voleeEnCours.length > 0 && (
          <div style={s.recap}>
            {voleeEnCours.map((code, i) => (
              <span key={i} style={{ ...s.recapItem, ...(meilleur3(voleeEnCours).includes(code) ? {} : s.recapItemHorsJeu) }}>
                {code}
              </span>
            ))}
          </div>
        )}
        <button style={s.validerBtn} onClick={validerVolee} disabled={voleeEnCours.length < MIN_FLECHES}>
          ✓ Valider la volée
        </button>
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
  ...exerciceStyles,
  recapItemHorsJeu: { color: "var(--text-dim)", backgroundColor: "var(--surface-sub)", textDecoration: "line-through" },
};
