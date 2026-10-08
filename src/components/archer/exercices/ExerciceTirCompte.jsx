import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { normFactor } from "../../../utils/seances";
import { pointsZone } from "../../../utils/blason";
import ZoneButtons from "./ZoneButtons";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles as s } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const estSalle = (distance) => distance === "5m" || distance === "18m";
const flechesParVolee = (distance) => (estSalle(distance) ? 3 : 6);

const todayISO = () => new Date().toISOString().split("T")[0];

const scoreVolee = (codes) => codes.reduce((n, c) => n + pointsZone(c), 0);

export default function ExerciceTirCompte({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
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

  const fpv  = flechesParVolee(distance);
  const base = normFactor(distance);

  const { cumul, flechesTirees, moyenne, projection } = useMemo(() => {
    const cumul         = volees.reduce((n, v) => n + scoreVolee(v), 0);
    const flechesTirees = volees.reduce((n, v) => n + v.length, 0);
    const moyenne        = flechesTirees > 0 ? cumul / flechesTirees : null;
    return { cumul, flechesTirees, moyenne, projection: moyenne != null ? Math.round(moyenne * base) : null };
  }, [volees, base]);

  const ajouterFleche = (code) => {
    if (voleeEnCours.length >= fpv) return;
    setVoleeEnCours((prev) => [...prev, code]);
  };

  const validerVolee = () => {
    if (voleeEnCours.length !== fpv) return;
    setVolees((prev) => [...prev, voleeEnCours]);
    setVoleeEnCours([]);
  };

  const annulerVolee = () => setVoleeEnCours([]);

  const handleTerminer = async () => {
    if (volees.length === 0) {
      setError(`Complétez au moins une volée de ${fpv} flèches avant de terminer.`);
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
      volees,
      volumePaille: 0,
      volumeBlason: 0,
      volumeCompte: flechesTirees,
      score:        cumul,
      totalFleches: flechesTirees,
      moyenne:      moyenne != null ? parseFloat(moyenne.toFixed(2)) : null,
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
      <p style={s.resume}>Volées de {fpv} flèches. Chaque flèche compte dans le score.</p>

      {autonome && (
        <div className="form-grid-4">
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={s.input} />
          </Field>
          <Field label="Distance">
            <select value={distance} onChange={(e) => setDistance(e.target.value)} style={s.input} disabled={volees.length > 0}>
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
        <div style={s.compteurTotal}>{volees.length > 0 ? cumul : "—"}</div>
        <div style={s.compteurLabel}>
          {flechesTirees} fl.{moyenne != null && ` · moy. ${moyenne.toFixed(2)} · ≈ ${projection} sur ${base}`} · {volees.length} volée{volees.length > 1 ? "s" : ""}
        </div>
      </div>

      <div style={s.voleeEnCoursBox}>
        <div style={s.voleeEnCoursHead}>
          <span>Volée en cours — {voleeEnCours.length}/{fpv} flèche{fpv > 1 ? "s" : ""}</span>
          {voleeEnCours.length > 0 && <button style={s.miniBtn} onClick={annulerVolee}>Vider</button>}
        </div>
        <ZoneButtons onPress={ajouterFleche} disabled={voleeEnCours.length >= fpv} />
        {voleeEnCours.length > 0 && (
          <div style={s.recap}>
            {voleeEnCours.map((code, i) => (
              <span key={i} style={s.recapItem}>{code}</span>
            ))}
          </div>
        )}
        <button style={s.validerBtn} onClick={validerVolee} disabled={voleeEnCours.length !== fpv}>
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
