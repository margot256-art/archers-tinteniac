import { useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { fmtDateLongue, todayISO, parOrdreDeTir } from "../../utils/seances";
import { PROTOCOLES_ACTIFS, protocoleDe } from "../../utils/exercices";
import { CarteExercice } from "../coach/DetailJour";
import { lireSeanceEnCours, ecrireSeanceEnCours, effacerSeanceEnCours } from "../../utils/seanceEnCours";
import { brouillonsDeSeance, effacerBrouillonsDeSeance } from "../../utils/brouillonExercice";
import { COMPOSANTS_EXERCICE } from "./exercices/index.js";
import BoutonSupprimer from "./exercices/BoutonSupprimer";
import { exerciceStyles, PINK } from "./exercices/exerciceStyles";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const nouveauSeanceId = () =>
  `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function NouvelleSeanceMulti({ onQuitter }) {
  const { user }     = useAuth();
  const { seances, updateCommentaireSeance, supprimerSeance } = useSeances();

  const [sauvegarde] = useState(() => lireSeanceEnCours(user?.id));

  const [phase, setPhase] = useState(() => (sauvegarde ? "en_cours" : "info"));
  const [seanceId] = useState(() => sauvegarde?.seanceId ?? nouveauSeanceId());

  const [date,     setDate]     = useState(sauvegarde?.date ?? todayISO());
  const [distance, setDistance] = useState(sauvegarde?.distance ?? "18m");
  const [type,     setType]     = useState(sauvegarde?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(sauvegarde?.lieu ?? "");
  const [commentaireSeance, setCommentaireSeance] = useState(sauvegarde?.commentaireSeance ?? "");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur,         setErreur]         = useState(null);

  // Un exercice de cette séance était en cours de saisie quand l'appli s'est
  // fermée (ou qu'on est revenu à l'accueil) : on le rouvre tel quel.
  const [brouillon] = useState(() => {
    if (!sauvegarde) return null;
    return brouillonsDeSeance(user?.id, sauvegarde.seanceId).find((b) => COMPOSANTS_EXERCICE[b.protocole]) ?? null;
  });

  const [enCours,    setEnCours]    = useState(brouillon && !brouillon.existantId ? brouillon.protocole : null); // id de protocole en cours de saisie (nouvel exercice)
  const [editingDoc, setEditingDoc] = useState(null); // exercice déjà fait, en cours de modification

  const mesResultats = useMemo(
    () => seances.filter((s) => s.seanceId === seanceId).sort(parOrdreDeTir),
    [seances, seanceId]
  );

  // Brouillon d'une modification d'exercice : on attend que l'exercice soit chargé.
  const [brouillonEditionRepris, setBrouillonEditionRepris] = useState(false);
  const docBrouillon = brouillon?.existantId && mesResultats.find((r) => r.id === brouillon.existantId);
  if (docBrouillon && !brouillonEditionRepris) {
    setBrouillonEditionRepris(true);
    setEditingDoc(docBrouillon);
  }

  const commencer = () => {
    ecrireSeanceEnCours(user?.id, { seanceId, date, distance, type, lieu });
    setPhase("en_cours");
  };

  const majCommentaireSeance = (texte) => {
    setCommentaireSeance(texte);
    ecrireSeanceEnCours(user?.id, { seanceId, date, distance, type, lieu, commentaireSeance: texte });
  };

  const terminerSeance = async () => {
    if (mesResultats.length > 0 && commentaireSeance.trim()) {
      setEnregistrement(true);
      setErreur(null);
      try {
        await updateCommentaireSeance(mesResultats.map((r) => r.id), commentaireSeance);
      } catch (err) {
        console.error("[NouvelleSeanceMulti] erreur commentaire :", err);
        setErreur("Impossible d'enregistrer le commentaire de séance.");
        setEnregistrement(false);
        return;
      }
    }
    effacerSeanceEnCours(user?.id);
    effacerBrouillonsDeSeance(user?.id, seanceId);
    onQuitter?.();
  };

  const supprimerLaSeance = async () => {
    setEnregistrement(true);
    setErreur(null);
    try {
      await supprimerSeance(mesResultats.map((r) => r.id));
    } catch (err) {
      console.error("[NouvelleSeanceMulti] erreur suppression :", err);
      setErreur("Impossible de supprimer la séance. Réessayez.");
      setEnregistrement(false);
      return;
    }
    effacerSeanceEnCours(user?.id);
    effacerBrouillonsDeSeance(user?.id, seanceId);
    onQuitter?.();
  };

  const seanceInfo = { date, distance, type, lieu };

  // ── Phase 1 : infos communes de la séance ────────────────────────────────
  if (phase === "info") {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <h2 style={s.title}>Nouvelle séance</h2>
          <button style={s.annulerBtn} onClick={onQuitter}>✕ Fermer</button>
        </div>
        <p style={s.resume}>Vous choisirez les exercices au fur et à mesure, une fois la séance commencée.</p>

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

        <button style={s.terminerBtn} onClick={commencer}>
          Commencer la séance
        </button>
      </div>
    );
  }

  // ── Saisie d'un nouvel exercice ───────────────────────────────────────────
  if (enCours) {
    const Composant = COMPOSANTS_EXERCICE[enCours];
    return (
      <Composant
        seanceInfo={seanceInfo}
        seanceId={seanceId}
        onTermine={() => setEnCours(null)}
        onAnnuler={() => setEnCours(null)}
      />
    );
  }

  // ── Modification d'un exercice déjà fait dans cette séance ──────────────
  if (editingDoc) {
    const Composant = COMPOSANTS_EXERCICE[protocoleDe(editingDoc)];
    return (
      <Composant
        existant={editingDoc}
        onTermine={() => setEditingDoc(null)}
        onAnnuler={() => setEditingDoc(null)}
      />
    );
  }

  // ── Entre deux exercices : récap + choix du suivant ──────────────────────
  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{fmtDateLongue(date)}</h2>
        <button style={s.annulerBtn} onClick={terminerSeance} disabled={enregistrement}>Terminer la séance</button>
      </div>
      <p style={s.resume}>{distance} · {type}{lieu ? ` · ${lieu}` : ""}</p>

      {/* Exercices déjà faits : même carte que le journal, en version résumée
          (le détail complet — feuille de marque, blason — reste dans le journal). */}
      {mesResultats.map((r) => (
        <CarteExercice key={r.id} doc={r} compact onModifier={() => setEditingDoc(r)} />
      ))}

      <div style={s.ajoutZone}>
        <span style={s.ajoutLabel}>
          {mesResultats.length > 0 ? "Ajouter un exercice :" : "Choisissez votre premier exercice :"}
        </span>
        <div style={s.choixGrid}>
          {PROTOCOLES_ACTIFS.map((p) => (
            <button key={p.id} type="button" style={s.choixCard} onClick={() => setEnCours(p.id)}>
              <span style={s.choixNom}>{p.nom}</span>
            </button>
          ))}
        </div>
      </div>

      {mesResultats.length > 0 && (
        <>
          <Field label="Commentaire de séance (optionnel)">
            <textarea
              value={commentaireSeance}
              onChange={(e) => majCommentaireSeance(e.target.value)}
              style={s.textarea}
              rows={3}
              placeholder="Ressenti général, conditions, points travaillés…"
            />
          </Field>
          {erreur && <p style={s.erreur}>{erreur}</p>}
          <button style={s.terminerBtn} onClick={terminerSeance} disabled={enregistrement}>
            {enregistrement ? "Enregistrement…" : "✓ Terminer la séance"}
          </button>
          <BoutonSupprimer label="la séance" onConfirm={supprimerLaSeance} disabled={enregistrement} />
        </>
      )}
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

  choixGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px",
  },
  choixCard: {
    display: "flex", alignItems: "center", gap: "8px",
    border: "1.5px solid var(--border-2)", borderRadius: "10px",
    padding: "12px 14px", backgroundColor: "var(--surface-raised)",
    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  },
  choixNom: { fontSize: "13px", fontWeight: "700", color: "var(--text)" },

  ajoutZone: { display: "flex", flexDirection: "column", gap: "8px" },
  ajoutLabel: { fontSize: "12px", color: "var(--text-dim)" },

  textarea: { ...exerciceStyles.input, resize: "vertical", minHeight: "70px", lineHeight: 1.4 },
  erreur: { fontSize: "13px", color: PINK, margin: 0 },
};
