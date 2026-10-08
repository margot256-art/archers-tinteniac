import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { pointsZone } from "../../../utils/blason";
import ZoneButtons from "./ZoneButtons";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const ZONE_MIN = 1;
const ZONE_MAX = 10;

const todayISO = () => new Date().toISOString().split("T")[0];
const estSalle = (distance) => distance === "5m" || distance === "18m";
const flechesParVolee = (distance) => estSalle(distance) ? 3 : 6;
const zoneInitiale = (distance) => estSalle(distance) ? 9 : 7;

const dansLaZone = (code, zone) => code !== "M" && pointsZone(code) >= zone;

// Toutes les flèches dans la zone → un cran plus serrée ; la moitié ou moins → un cran plus large.
function zoneSuivante(zone, nbDansZone, fpv) {
  const seuilDescente = Math.floor(fpv / 2);
  if (nbDansZone >= fpv) return Math.min(zone + 1, ZONE_MAX);
  if (nbDansZone <= seuilDescente) return Math.max(zone - 1, ZONE_MIN);
  return zone;
}

export default function ExerciceZone({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const fpv = flechesParVolee(distance);

  const [volees,       setVolees]       = useState(existant?.volees ?? []); // [{ zone, fleches: [codes], dansZone }]
  const [zoneActuelle, setZoneActuelle] = useState(() => {
    const dejaFaites = existant?.volees ?? [];
    if (dejaFaites.length) {
      const derniere = dejaFaites[dejaFaites.length - 1];
      return zoneSuivante(derniere.zone, derniere.dansZone, flechesParVolee(existant.distance));
    }
    return zoneInitiale(existant?.distance ?? seanceInfo?.distance ?? "18m");
  });
  const [voleeEnCours, setVoleeEnCours] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const changerDistance = (d) => {
    setDistance(d);
    if (volees.length === 0) { setZoneActuelle(zoneInitiale(d)); setVoleeEnCours([]); }
  };

  const { cumulTirees, cumulDansZone, cumulPoints, pourcentage } = useMemo(() => {
    const cumulTirees   = volees.reduce((s, v) => s + v.fleches.length, 0);
    const cumulDansZone = volees.reduce((s, v) => s + v.dansZone, 0);
    const cumulPoints   = volees.reduce((s, v) => s + v.fleches.reduce((n, c) => n + pointsZone(c), 0), 0);
    return { cumulTirees, cumulDansZone, cumulPoints, pourcentage: cumulTirees ? Math.round((cumulDansZone / cumulTirees) * 100) : null };
  }, [volees]);

  const ajouterFleche = (code) => {
    if (voleeEnCours.length >= fpv) return;
    setVoleeEnCours((prev) => [...prev, code]);
  };

  const validerVolee = () => {
    if (voleeEnCours.length !== fpv) return;
    const dansZone = voleeEnCours.filter((c) => dansLaZone(c, zoneActuelle)).length;
    setVolees((prev) => [...prev, { zone: zoneActuelle, fleches: voleeEnCours, dansZone }]);
    setZoneActuelle(zoneSuivante(zoneActuelle, dansZone, fpv));
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
      protocole:    "zone",
      volees,
      zoneCible:    volees[0]?.zone ?? zoneInitiale(distance),
      zoneDansZone: cumulDansZone,
      volumePaille: 0,
      volumeBlason: 0,
      volumeCompte: cumulTirees,
      score:        cumulPoints,
      totalFleches: cumulTirees,
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
      console.error("[ExerciceZone] erreur Firestore :", err);
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
      console.error("[ExerciceZone] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Zone" : "Zone"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        Volées de {fpv} flèches. Toutes dans la zone : elle se resserre. La moitié ou moins : elle s'élargit.
      </p>

      {autonome && (
        <div className="form-grid-4">
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={s.input} />
          </Field>
          <Field label="Distance">
            <select value={distance} onChange={(e) => changerDistance(e.target.value)} style={s.input} disabled={volees.length > 0}>
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
        <div style={s.compteurTotal}>{pourcentage != null ? `${pourcentage} %` : "—"}</div>
        <div style={s.compteurLabel}>
          {cumulDansZone}/{cumulTirees} dans la zone · {volees.length} volée{volees.length > 1 ? "s" : ""}
        </div>
        <div style={s.zoneActuelle}>Zone visée actuelle : <strong>{zoneActuelle === ZONE_MAX ? "X/10" : zoneActuelle}</strong> et mieux</div>
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
              <span key={i} style={{ ...s.recapItem, ...(dansLaZone(code, zoneActuelle) ? {} : s.recapItemHorsZone) }}>
                {code}
              </span>
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

const s = {
  ...exerciceStyles,
  zoneActuelle: { fontSize: "13px", color: "var(--text-2)" },
  recapItemHorsZone: { color: "var(--text-dim)", backgroundColor: "var(--surface-sub)" },
};
