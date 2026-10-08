import { useState, useMemo } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles, PINK } from "./exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const SUPPORTS = [
  { id: "paille",         libelle: "Paille" },
  { id: "visuel-simple",  libelle: "Visuel simple" },
  { id: "visuel-evolue",  libelle: "Visuel évolué" },
  { id: "cible",          libelle: "Cible" },
];
const libelleSupport = (id) => SUPPORTS.find((s) => s.id === id)?.libelle ?? id;

const MAX_PAR_VOLEE = 24;
const MAX_OBJECTIF  = 1000;

const todayISO = () => new Date().toISOString().split("T")[0];

// Les volumes "sans score" du protocole Volume alimentent les mêmes compteurs que
// le formulaire classique (vol. paille / vol. blason), pour rester compatibles avec
// les stats, objectifs et le tableau de bord du coach. "Cible" n'est pas du tir
// compté : ça part donc dans vol. blason, pas dans vol. tir compté.
function versVolumesClassiques(volees) {
  let volumePaille = 0;
  let volumeBlason = 0;
  for (const v of volees) {
    if (v.support === "paille") volumePaille += v.fleches;
    else volumeBlason += v.fleches;
  }
  return { volumePaille, volumeBlason };
}

export default function ExerciceVolume({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");

  const [flechesParVolee, setFlechesParVolee] = useState(6);
  const [support,         setSupport]         = useState("cible");
  const [objectif,        setObjectif]        = useState(existant?.objectifVolume ? String(existant.objectifVolume) : "");
  const [volees,           setVolees]          = useState(existant?.volees ?? []); // [{ support, fleches }]
  const [commentaire,     setCommentaire]     = useState(existant?.commentaire ?? "");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const totalFleches = useMemo(() => volees.reduce((n, v) => n + v.fleches, 0), [volees]);

  const parSupport = useMemo(() => {
    return SUPPORTS
      .map((s) => ({ ...s, fleches: volees.filter((v) => v.support === s.id).reduce((n, v) => n + v.fleches, 0) }))
      .filter((s) => s.fleches > 0);
  }, [volees]);

  const objectifNum = parseInt(objectif) || 0;
  const avancement  = objectifNum > 0 ? Math.min(100, Math.round((totalFleches / objectifNum) * 100)) : null;

  const ajouterVolee = () => {
    setVolees((prev) => [...prev, { support, fleches: flechesParVolee }]);
  };

  const ajusterDerniere = (delta) => {
    setVolees((prev) => {
      if (prev.length === 0) return prev;
      const derniere = prev[prev.length - 1];
      const n = derniere.fleches + delta;
      if (n <= 0) return prev.slice(0, -1); // −1 sur 1 flèche : on annule la volée
      return [...prev.slice(0, -1), { ...derniere, fleches: Math.min(n, MAX_PAR_VOLEE) }];
    });
  };

  const handleTerminer = async () => {
    if (volees.length === 0) {
      setError("Ajoutez au moins une volée avant de terminer.");
      return;
    }
    setError("");
    setSaving(true);
    const { volumePaille, volumeBlason } = versVolumesClassiques(volees);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "volume",
      volees,
      objectifVolume: objectifNum || null,
      volumePaille,
      volumeBlason,
      volumeCompte: 0,
      score:        0,
      totalFleches,
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
      console.error("[ExerciceVolume] erreur Firestore :", err);
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
      console.error("[ExerciceVolume] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Volume" : "Volume"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        Tirez sans compter les points. Un appui ajoute une volée ; −1 et +1 corrigent la dernière.
      </p>

      {/* ── Réglages de séance ── */}
      {autonome && (
        <div className="form-grid-4" style={s.reglages}>
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

      {/* ── Compteur en direct ── */}
      <div style={s.compteurBox}>
        <div style={s.compteurTotal}>{totalFleches}</div>
        <div style={s.compteurLabel}>flèche{totalFleches > 1 ? "s" : ""} tirée{totalFleches > 1 ? "s" : ""} · {volees.length} volée{volees.length > 1 ? "s" : ""}</div>

        {avancement !== null && (
          <div style={s.barTrack}>
            <div style={{ ...s.barFill, width: `${avancement}%` }} />
          </div>
        )}
        {parSupport.length > 0 && (
          <div style={s.parSupport}>
            {parSupport.map((sp) => (
              <span key={sp.id} style={s.parSupportItem}>{sp.libelle} {sp.fleches}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Réglages de la prochaine volée ── */}
      <div className="form-grid-4">
        <Field label="Flèches / volée">
          <input
            type="number" min="1" max={MAX_PAR_VOLEE}
            value={flechesParVolee}
            onChange={(e) => setFlechesParVolee(Math.max(1, Math.min(MAX_PAR_VOLEE, parseInt(e.target.value) || 1)))}
            style={s.input}
          />
        </Field>
        <Field label="Support">
          <select value={support} onChange={(e) => setSupport(e.target.value)} style={s.input}>
            {SUPPORTS.map((sp) => <option key={sp.id} value={sp.id}>{sp.libelle}</option>)}
          </select>
        </Field>
        <Field label="Objectif (optionnel)">
          <input
            type="number" min="1" max={MAX_OBJECTIF}
            value={objectif}
            onChange={(e) => setObjectif(e.target.value)}
            style={s.input} placeholder="ex : 100"
          />
        </Field>
      </div>

      {/* ── Actions volée ── */}
      <div style={s.actions}>
        <button
          style={{ ...s.corrigerBtn, ...(volees.length === 0 ? s.corrigerBtnOff : {}) }}
          onClick={() => ajusterDerniere(-1)} disabled={volees.length === 0}
        >−1</button>
        <button style={s.voleeBtn} onClick={ajouterVolee}>+ Volée ({flechesParVolee} fl.)</button>
        <button
          style={{ ...s.corrigerBtn, ...(volees.length === 0 ? s.corrigerBtnOff : {}) }}
          onClick={() => ajusterDerniere(1)} disabled={volees.length === 0}
        >+1</button>
      </div>

      {volees.length > 0 && (
        <div style={s.journal}>
          {[...volees].reverse().slice(0, 8).map((v, i) => (
            <span key={volees.length - 1 - i} style={s.journalItem}>
              {v.fleches} fl. · {libelleSupport(v.support)}
            </span>
          ))}
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
  ...exerciceStyles,
  reglages: {},
  barTrack: { width: "100%", maxWidth: "280px", height: "7px", borderRadius: "10px", backgroundColor: "var(--border)", overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: "10px", backgroundColor: PINK, transition: "width 0.3s ease" },
  parSupport: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" },
  parSupportItem: { fontSize: "12px", color: "var(--text-dim)" },
};
