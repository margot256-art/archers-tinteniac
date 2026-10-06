import { useState, useMemo } from "react";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY, fmtDate } from "../../utils/seances";
import { PROTOCOLE_PAR_ID, protocoleDe, indicateurExercice } from "../../utils/exercices";
import { COMPOSANTS_EXERCICE } from "./exercices/index.js";

export default function Journal() {
  const { seances, loading, error } = useSeances();
  const [ouverte,    setOuverte]    = useState(null); // clé de séance ouverte, ou null
  const [editingDoc, setEditingDoc] = useState(null); // doc en cours d'édition, ou null

  const sessions = useMemo(() => {
    const map = new Map();
    for (const s of seances) {
      if (!s.date) continue;
      const cle = s.seanceId ?? s.id;
      if (!map.has(cle)) map.set(cle, []);
      map.get(cle).push(s);
    }
    return [...map.entries()]
      .map(([cle, docs]) => {
        const tries = [...docs].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        const premier = tries[0];
        return { cle, docs: tries, date: premier.date, distance: premier.distance, type: premier.type, lieu: premier.lieu };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [seances]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  // ── Édition d'un exercice de la séance ──────────────────────────────────
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

  // ── Détail d'une séance ──────────────────────────────────────────────────
  const session = sessions.find((x) => x.cle === ouverte);
  if (session) {
    return (
      <div style={s.page}>
        <button style={s.retourBtn} onClick={() => setOuverte(null)}>← Retour au journal</button>

        <div style={s.detailHead}>
          <h2 style={s.detailDate}>{fmtDate(session.date)}</h2>
          <p style={s.detailMeta}>
            {session.distance} · {session.type}{session.lieu ? ` · ${session.lieu}` : ""}
          </p>
        </div>

        <div style={s.exerciceListe}>
          {session.docs.map((d) => {
            const proto = PROTOCOLE_PAR_ID[protocoleDe(d)];
            const ind   = indicateurExercice(protocoleDe(d), d);
            return (
              <button key={d.id} style={s.exerciceRow} onClick={() => setEditingDoc(d)}>
                <span style={s.exerciceNom}>{proto?.nom ?? d.protocole}</span>
                <span style={s.exerciceResultat}>{ind?.texte ?? "—"}</span>
                <span style={s.exerciceModifier}>Modifier →</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Liste des séances ─────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {sessions.length === 0 ? (
        <div style={s.empty}>Aucune séance pour l'instant.</div>
      ) : (
        <div style={s.liste}>
          {sessions.map((sess) => (
            <button key={sess.cle} style={s.sessionCard} onClick={() => setOuverte(sess.cle)}>
              <div style={s.sessionHead}>
                <span style={s.sessionDate}>{fmtDate(sess.date)}</span>
                <span style={s.sessionMeta}>{sess.distance} · {sess.type}{sess.lieu ? ` · ${sess.lieu}` : ""}</span>
              </div>
              <div style={s.sessionExercices}>
                {sess.docs.map((d) => PROTOCOLE_PAR_ID[protocoleDe(d)]?.nom ?? d.protocole).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "14px" },

  liste: { display: "flex", flexDirection: "column", gap: "10px" },
  sessionCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "6px",
    textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit",
  },
  sessionHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px" },
  sessionDate: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  sessionMeta: { fontSize: "12px", color: "var(--text-muted)" },
  sessionExercices: { fontSize: "13px", color: PRIMARY, fontWeight: "600" },

  retourBtn: {
    alignSelf: "flex-start", background: "none", border: "none",
    color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
    padding: "4px 0",
  },
  detailHead: { display: "flex", flexDirection: "column", gap: "2px" },
  detailDate: { fontSize: "20px", fontWeight: "800", color: "var(--text)", margin: 0 },
  detailMeta: { fontSize: "13px", color: "var(--text-muted)", margin: 0 },

  exerciceListe: { display: "flex", flexDirection: "column", gap: "1px", borderRadius: "12px", overflow: "hidden", boxShadow: "var(--shadow-card)" },
  exerciceRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
    backgroundColor: "var(--surface)", border: "none", cursor: "pointer", fontFamily: "inherit",
    padding: "14px 16px", textAlign: "left",
  },
  exerciceNom:      { fontSize: "14px", fontWeight: "700", color: "var(--text)", flex: "1 1 auto" },
  exerciceResultat: { fontSize: "15px", fontWeight: "800", color: PRIMARY },
  exerciceModifier: { fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" },

  empty: {
    backgroundColor: "var(--surface)", borderRadius: "12px",
    boxShadow: "var(--shadow-card)", padding: "40px", textAlign: "center",
    color: "var(--text-dim)", fontSize: "14px",
  },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PRIMARY, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "rgba(255,0,122,0.1)", borderRadius: "8px", border: `1px solid ${PRIMARY}`,
  },
};
