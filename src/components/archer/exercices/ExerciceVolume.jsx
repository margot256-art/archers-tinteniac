import { useState, useMemo, useEffect, useRef } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, sansAttendreLeServeur } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from "../../../utils/brouillonExercice";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles, PINK } from "./exerciceStyles";
import { todayISO } from "../../../utils/seances";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const SUPPORTS = [
  { id: "paille", libelle: "Paille" },
  { id: "blason", libelle: "Blason" },
];
// Les anciennes volées (visuel simple / évolué, cible) comptaient déjà en vol. blason :
// elles s'affichent donc comme « Blason ».
const supportDe      = (v) => (v.support === "paille" ? "paille" : "blason");
const libelleSupport = (v) => SUPPORTS.find((s) => s.id === supportDe(v)).libelle;

const MAX_PAR_VOLEE = 24;


// Les volumes "sans score" du protocole Volume alimentent les mêmes compteurs que
// le formulaire classique (vol. paille / vol. blason), pour rester compatibles avec
// les stats, objectifs et le tableau de bord du coach. Le blason n'est pas du tir
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

  // Saisie interrompue (appli fermée, retour à l'accueil…) : on reprend le brouillon.
  const exercice = { protocole: "volume", seanceId, existantId: existant?.id };
  const [brouillon] = useState(() => lireBrouillon(user?.id, exercice));

  const [date,     setDate]     = useState(brouillon?.date ?? existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(brouillon?.distance ?? existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(brouillon?.type ?? existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(brouillon?.lieu ?? existant?.lieu ?? seanceInfo?.lieu ?? "");

  // Texte brut du champ, pour pouvoir le vider et retaper un nombre ; le nombre
  // utilisé n'est valide que s'il est entre 1 et MAX_PAR_VOLEE.
  const [saisieFpv, setSaisieFpv] = useState(brouillon?.saisieFpv ?? "6");
  const flechesParVolee = Math.min(MAX_PAR_VOLEE, parseInt(saisieFpv) || 0);
  const fpvValide = flechesParVolee >= 1;
  const [support,         setSupport]         = useState(brouillon?.support ?? "blason");
  const [volees,           setVolees]          = useState(brouillon?.volees ?? existant?.volees ?? []); // [{ support, fleches }]
  const [commentaire,     setCommentaire]     = useState(brouillon?.commentaire ?? existant?.commentaire ?? "");

  // Brouillon écrit dès le premier changement (pas à la simple ouverture de l'écran) ;
  // un nouvel exercice sans aucune volée n'a rien à reprendre.
  const ouverture = useRef(true);
  useEffect(() => {
    if (ouverture.current) { ouverture.current = false; return; }
    if (!enEdition && volees.length === 0) {
      effacerBrouillon(user?.id, exercice);
      return;
    }
    ecrireBrouillon(user?.id, exercice, { date, distance, type, lieu, saisieFpv, support, volees, commentaire });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `exercice` et `enEdition` sont fixes pour la vie de l'écran
  }, [user?.id, date, distance, type, lieu, saisieFpv, support, volees, commentaire]);

  const quitter = (callback) => { effacerBrouillon(user?.id, exercice); callback?.(); };

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const totalFleches = useMemo(() => volees.reduce((n, v) => n + v.fleches, 0), [volees]);

  const parSupport = useMemo(() => {
    return SUPPORTS
      .map((s) => ({ ...s, fleches: volees.filter((v) => supportDe(v) === s.id).reduce((n, v) => n + v.fleches, 0) }))
      .filter((s) => s.fleches > 0);
  }, [volees]);

  const ajouterVolee = () => {
    if (!fpvValide) return;
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

  const retirerVolee = (index) => {
    setVolees((prev) => prev.filter((_, i) => i !== index));
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
        sansAttendreLeServeur(updateDoc(doc(db, "seances", existant.id), payload), "ExerciceVolume");
      } else {
        sansAttendreLeServeur(addDoc(collection(db, "seances"), { ...payload, createdAt: serverTimestamp() }), "ExerciceVolume");
      }
      quitter(onTermine);
    } catch (err) {
      console.error("[ExerciceVolume] erreur Firestore :", err);
      setError("Erreur lors de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  };

  const handleSupprimer = async () => {
    setSaving(true);
    try {
      sansAttendreLeServeur(deleteDoc(doc(db, "seances", existant.id)), "ExerciceVolume");
      quitter(onTermine);
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
        <button style={s.annulerBtn} onClick={() => quitter(onAnnuler)}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        Tirez sans compter les points. Un appui ajoute une volée ; −1 et +1 corrigent la dernière, × retire une volée.
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
            inputMode="numeric"
            value={saisieFpv}
            onChange={(e) => {
              const chiffres = e.target.value.replace(/\D/g, "");
              setSaisieFpv(chiffres === "" ? "" : String(Math.min(MAX_PAR_VOLEE, parseInt(chiffres))));
            }}
            style={s.input}
          />
        </Field>
        <Field label="Support">
          <div style={s.supportBtns}>
            {SUPPORTS.map((sp) => (
              <button
                key={sp.id} type="button"
                style={{ ...s.supportBtn, ...(support === sp.id ? s.supportBtnActif : {}) }}
                onClick={() => setSupport(sp.id)}
              >
                {sp.libelle}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* ── Actions volée ── */}
      <div style={s.actions}>
        <button
          style={{ ...s.corrigerBtn, ...(volees.length === 0 ? s.corrigerBtnOff : {}) }}
          onClick={() => ajusterDerniere(-1)} disabled={volees.length === 0}
        >−1</button>
        <button
          style={{ ...s.voleeBtn, ...(fpvValide ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
          onClick={ajouterVolee} disabled={!fpvValide}
        >
          {fpvValide ? `+ Volée (${flechesParVolee} fl.)` : "+ Volée"}
        </button>
        <button
          style={{ ...s.corrigerBtn, ...(volees.length === 0 ? s.corrigerBtnOff : {}) }}
          onClick={() => ajusterDerniere(1)} disabled={volees.length === 0}
        >+1</button>
      </div>

      {volees.length > 0 && (
        <>
          <button style={s.annulerVoleeBtn} onClick={() => retirerVolee(volees.length - 1)}>
            ↶ Annuler la dernière volée
          </button>
          <div style={s.journal}>
            {[...volees].reverse().slice(0, 8).map((v, i) => {
              const index = volees.length - 1 - i;
              return (
                <span key={index} style={{ ...s.journalItem, ...s.voleeItem }}>
                  {v.fleches} fl. · {libelleSupport(v)}
                  <button style={s.retirerBtn} onClick={() => retirerVolee(index)} aria-label="Retirer cette volée">×</button>
                </span>
              );
            })}
          </div>
        </>
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
  parSupport: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" },
  parSupportItem: { fontSize: "12px", color: "var(--text-dim)" },

  supportBtns: { display: "flex", gap: "8px" },
  supportBtn: {
    flex: "1 1 0", padding: "10px 12px", borderRadius: "9px",
    border: "1.5px solid var(--border-2)", backgroundColor: "var(--input-bg)",
    fontSize: "14px", fontWeight: "700", color: "var(--text-muted)",
    cursor: "pointer", fontFamily: "inherit",
  },
  supportBtnActif: { backgroundColor: PINK, borderColor: PINK, color: "#fff" },

  annulerVoleeBtn: {
    alignSelf: "flex-start", background: "none", border: "1.5px solid var(--border-3)", borderRadius: "10px",
    color: "var(--text-2)", fontSize: "13px", fontWeight: "700", padding: "8px 14px",
    cursor: "pointer", fontFamily: "inherit",
  },
  voleeItem: { display: "inline-flex", alignItems: "center", gap: "6px", paddingRight: "4px" },
  retirerBtn: {
    background: "none", border: "none", color: "var(--text-dim)", fontSize: "15px", lineHeight: 1,
    padding: "0 4px", cursor: "pointer", fontFamily: "inherit",
  },
};
