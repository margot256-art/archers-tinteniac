import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { normFactor } from "../../../utils/seances";
import { pointsZone, couleurZone } from "../../../utils/blason";
import ZoneButtons from "./ZoneButtons";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles, PINK } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const OBJECTIF_FLECHES = 100;

const todayISO = () => new Date().toISOString().split("T")[0];

const compteursVides = () => ({});
const nbCompteurs = (c) => Object.values(c).reduce((s, n) => s + n, 0);
const scoreCompteurs = (c) => Object.entries(c).reduce((s, [code, n]) => s + n * pointsZone(code), 0);

export default function ExerciceTest100({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const [volees,      setVolees]      = useState(existant?.volees ?? []); // [{ X:1, '10':2, ... }]
  const [voleeEnCours, setVoleeEnCours] = useState(compteursVides());

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const { flechesCommis, scoreCommis } = useMemo(() => ({
    flechesCommis: volees.reduce((s, v) => s + nbCompteurs(v), 0),
    scoreCommis:   volees.reduce((s, v) => s + scoreCompteurs(v), 0),
  }), [volees]);

  const nbEnCours = nbCompteurs(voleeEnCours);
  const base = normFactor(distance);

  const ajouterFleche = (code) => {
    setVoleeEnCours((prev) => ({ ...prev, [code]: (prev[code] ?? 0) + 1 }));
  };

  const validerVolee = () => {
    if (nbEnCours === 0) return;
    setVolees((prev) => [...prev, voleeEnCours]);
    setVoleeEnCours(compteursVides());
  };

  const annulerVolee = () => setVoleeEnCours(compteursVides());

  const handleTerminer = async () => {
    const finales = nbEnCours > 0 ? [...volees, voleeEnCours] : volees;
    const fleches = finales.reduce((s, v) => s + nbCompteurs(v), 0);
    if (fleches === 0) {
      setError("Ajoutez au moins une flèche avant de terminer.");
      return;
    }
    const score   = finales.reduce((s, v) => s + scoreCompteurs(v), 0);
    const moyenne = score / fleches;

    setError("");
    setSaving(true);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "test100",
      volees:       finales,
      volumePaille: 0,
      volumeBlason: 0,
      volumeCompte: fleches,
      score,
      totalFleches: fleches,
      moyenne,
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
      console.error("[ExerciceTest100] erreur Firestore :", err);
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
      console.error("[ExerciceTest100] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Test 100" : "Test 100"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        Environ 100 flèches en volées libres. Comptez chaque flèche par zone, validez la volée, répétez.
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
        <div style={s.compteurTotal}>{flechesCommis + nbEnCours} / {OBJECTIF_FLECHES}</div>
        <div style={s.compteurLabel}>
          flèches · {scoreCommis} pts validés
          {flechesCommis > 0 && ` · moy. ${(scoreCommis / flechesCommis).toFixed(2)} · ≈ ${Math.round((scoreCommis / flechesCommis) * base)} sur ${base}`}
        </div>
        <div style={s.barTrack}>
          <div style={{ ...s.barFill, width: `${Math.min(100, Math.round(((flechesCommis + nbEnCours) / OBJECTIF_FLECHES) * 100))}%` }} />
        </div>
      </div>

      <div style={s.voleeEnCoursBox}>
        <div style={s.voleeEnCoursHead}>
          <span>Volée en cours — {nbEnCours} flèche{nbEnCours > 1 ? "s" : ""}</span>
          {nbEnCours > 0 && <button style={s.miniBtn} onClick={annulerVolee}>Vider</button>}
        </div>
        <ZoneButtons onPress={ajouterFleche} />
        {nbEnCours > 0 && (
          <div style={s.recap}>
            {Object.entries(voleeEnCours).map(([code, n]) => {
              const c = couleurZone(code);
              return <span key={code} style={{ ...s.recapItem, backgroundColor: c.bg, color: c.text }}>{code} ×{n}</span>;
            })}
          </div>
        )}
        <button style={s.validerBtn} onClick={validerVolee} disabled={nbEnCours === 0}>
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
  barTrack: { width: "100%", maxWidth: "280px", height: "7px", borderRadius: "10px", backgroundColor: "var(--border)", overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: "10px", backgroundColor: PINK, transition: "width 0.3s ease" },
};
