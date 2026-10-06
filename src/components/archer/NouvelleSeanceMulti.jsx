import { useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY, fmtDate } from "../../utils/seances";
import { PROTOCOLES_ACTIFS, PROTOCOLE_PAR_ID, protocoleDe, indicateurExercice } from "../../utils/exercices";
import { lireSeanceEnCours, ecrireSeanceEnCours, effacerSeanceEnCours } from "../../utils/seanceEnCours";
import { COMPOSANTS_EXERCICE } from "./exercices/index.js";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const todayISO = () => new Date().toISOString().split("T")[0];

const nouveauSeanceId = () =>
  `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function NouvelleSeanceMulti({ onQuitter }) {
  const { user }     = useAuth();
  const { seances }  = useSeances();

  const [sauvegarde] = useState(() => lireSeanceEnCours(user?.id));

  const [phase, setPhase] = useState(() => (sauvegarde ? "en_cours" : "info"));
  const [seanceId] = useState(() => sauvegarde?.seanceId ?? nouveauSeanceId());

  const [date,     setDate]     = useState(sauvegarde?.date ?? todayISO());
  const [distance, setDistance] = useState(sauvegarde?.distance ?? "18m");
  const [type,     setType]     = useState(sauvegarde?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(sauvegarde?.lieu ?? "");

  const [enCours,    setEnCours]    = useState(null); // id de protocole en cours de saisie (nouvel exercice)
  const [editingDoc, setEditingDoc] = useState(null); // exercice déjà fait, en cours de modification

  const mesResultats = useMemo(
    () => seances.filter((s) => s.seanceId === seanceId),
    [seances, seanceId]
  );

  const commencer = () => {
    ecrireSeanceEnCours(user?.id, { seanceId, date, distance, type, lieu });
    setPhase("en_cours");
  };

  const terminerSeance = () => {
    effacerSeanceEnCours(user?.id);
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
        <h2 style={s.title}>Séance du {fmtDate(date)}</h2>
        <button style={s.annulerBtn} onClick={terminerSeance}>Terminer la séance</button>
      </div>
      <p style={s.resume}>{distance} · {type}{lieu ? ` · ${lieu}` : ""}</p>

      {mesResultats.length > 0 && (
        <div style={s.recapListe}>
          {mesResultats.map((r) => {
            const proto = PROTOCOLE_PAR_ID[protocoleDe(r)];
            const ind   = indicateurExercice(protocoleDe(r), r);
            return (
              <button key={r.id} type="button" style={s.recapRow} onClick={() => setEditingDoc(r)}>
                <span style={s.recapNom}>{proto?.nom ?? r.protocole}</span>
                <span style={s.recapResultat}>{ind?.texte ?? "—"}</span>
                <span style={s.recapModifier}>Modifier →</span>
              </button>
            );
          })}
        </div>
      )}

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
        <button style={s.terminerBtn} onClick={terminerSeance}>✓ Terminer la séance</button>
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

  recapListe: { display: "flex", flexDirection: "column", gap: "1px", borderRadius: "10px", overflow: "hidden" },
  recapRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px",
    padding: "12px 14px", backgroundColor: "var(--surface-raised)",
    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  },
  recapNom: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)", flex: "1 1 auto" },
  recapResultat: { fontSize: "14px", fontWeight: "800", color: PRIMARY },
  recapModifier: { fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" },

  ajoutZone: { display: "flex", flexDirection: "column", gap: "8px" },
  ajoutLabel: { fontSize: "12px", color: "var(--text-dim)" },

  terminerBtn: {
    backgroundColor: "#16a34a", color: "#fff", border: "none",
    borderRadius: "10px", padding: "14px", fontSize: "15px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
};
