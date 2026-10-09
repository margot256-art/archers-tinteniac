import { useState, useMemo } from "react";
import { useSeances } from "../../hooks/useSeances";
import { PRIMARY as PINK, BLUE, getCompte, buildMonthTotals, fmtDate } from "../../utils/seances";
import { PROTOCOLE_PAR_ID, protocoleDe, indicateurExercice, resultatAvecMoyenne } from "../../utils/exercices";

const estCompet = (type) => type === "Compétition";
const couleurType = (type) => (estCompet(type) ? BLUE : PINK);
const fondType    = (type) => (estCompet(type) ? "var(--blue-soft)" : "var(--pink-soft)");
const nomExercice = (d) => PROTOCOLE_PAR_ID[protocoleDe(d)]?.nom ?? d.protocole;
import { COMPOSANTS_EXERCICE } from "./exercices/index.js";
import BoutonSupprimer from "./exercices/BoutonSupprimer";

export default function Journal() {
  const { seances, loading, error, updateCommentaireSeance, supprimerSeance } = useSeances();
  const [ouverte,    setOuverte]    = useState(null); // clé de séance ouverte, ou null
  const [editingDoc, setEditingDoc] = useState(null); // doc en cours d'édition, ou null
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreurSuppression,  setErreurSuppression]  = useState(null);

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
        const commentaireSeance = tries.find((d) => d.commentaireSeance)?.commentaireSeance ?? "";
        const retourCoach = tries.find((d) => d.retourCoach)?.retourCoach ?? "";
        const { tp, tb, ts, tmoy, tscoreMoy } = buildMonthTotals(tries);
        const compte = tries.reduce((n, d) => n + getCompte(d), 0);
        const chiffres = {
          paille: tp, blason: tb, compte, total: tp + tb + compte,
          score: ts, moyenne: tmoy, scoreMoy: tscoreMoy,
        };
        return { cle, docs: tries, date: premier.date, distance: premier.distance, type: premier.type, lieu: premier.lieu, commentaireSeance, retourCoach, chiffres };
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

        {session.retourCoach && (
          <div style={s.retourCoachBox}>
            <p style={s.retourCoachLabel}>Retour du coach</p>
            <p style={s.retourCoachTexte}>{session.retourCoach}</p>
          </div>
        )}

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

        <CommentaireSeance
          key={session.cle}
          initial={session.commentaireSeance}
          onEnregistrer={(texte) => updateCommentaireSeance(session.docs.map((d) => d.id), texte)}
        />

        {erreurSuppression && <div style={s.errMsg}>{erreurSuppression}</div>}
        <BoutonSupprimer
          label="la séance"
          disabled={suppressionEnCours}
          onConfirm={async () => {
            setSuppressionEnCours(true);
            setErreurSuppression(null);
            try {
              await supprimerSeance(session.docs.map((d) => d.id));
              setOuverte(null);
            } catch (err) {
              console.error("[Journal] erreur suppression séance :", err);
              setErreurSuppression("Impossible de supprimer la séance. Réessayez.");
            } finally {
              setSuppressionEnCours(false);
            }
          }}
        />
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
          {sessions.map((sess) => {
            const couleur = couleurType(sess.type);
            const c = sess.chiffres;
            return (
              <button key={sess.cle} style={{ ...s.sessionCard, borderLeft: `4px solid ${couleur}` }} onClick={() => setOuverte(sess.cle)}>
                <div style={s.sessionHead}>
                  <span style={s.sessionDate}>{fmtDate(sess.date)}</span>
                  <span style={{ ...s.typeBadge, color: couleur, backgroundColor: fondType(sess.type) }}>{sess.type}</span>
                </div>
                <div style={s.sessionMeta}>{sess.distance}{sess.lieu ? ` · ${sess.lieu}` : ""}</div>

                <div style={s.sessionExercices}>
                  {sess.docs.map((d) => {
                    const res = resultatAvecMoyenne(d);
                    return (
                      <div key={d.id} style={s.exoLigne}>
                        <span style={s.exoNom}>{nomExercice(d)}</span>
                        {res && <span style={{ ...s.exoResultat, color: couleur }}>{res}</span>}
                      </div>
                    );
                  })}
                </div>

                <div style={s.chiffres}>
                  {c.paille > 0 && <Chiffre label="Paille" valeur={c.paille} />}
                  {c.blason > 0 && <Chiffre label="Blason" valeur={c.blason} />}
                  {c.compte > 0 && <Chiffre label="Compté" valeur={c.compte} />}
                  <Chiffre label="Total" valeur={`${c.total} fl.`} />
                  {c.score > 0 && <Chiffre label="Score" valeur={c.score} />}
                  {c.moyenne != null && <Chiffre label="Moy." valeur={c.moyenne.toFixed(2)} />}
                  {c.scoreMoy != null && <Chiffre label="Score moy." valeur={c.scoreMoy} couleur={couleur} />}
                </div>

                {sess.commentaireSeance && (
                  <div style={s.sessionCommentaire}>« {sess.commentaireSeance} »</div>
                )}
                {sess.retourCoach && (
                  <div style={s.sessionRetourTexte}>
                    <span style={s.sessionRetour}>Retour du coach</span> {sess.retourCoach}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chiffre({ label, valeur, couleur }) {
  return (
    <span style={s.chiffre}>
      <span style={s.chiffreLabel}>{label}</span>
      <span style={{ ...s.chiffreValeur, ...(couleur ? { color: couleur } : {}) }}>{valeur}</span>
    </span>
  );
}

function CommentaireSeance({ initial, onEnregistrer }) {
  const [texte,  setTexte]  = useState(initial);
  const [etat,   setEtat]   = useState(null); // null | "envoi" | "ok" | "erreur"

  const modifie = texte.trim() !== (initial ?? "").trim();

  const enregistrer = async () => {
    setEtat("envoi");
    try {
      await onEnregistrer(texte);
      setEtat("ok");
    } catch (err) {
      console.error("[Journal] erreur commentaire de séance :", err);
      setEtat("erreur");
    }
  };

  return (
    <div style={s.commentaireBox}>
      <label style={s.commentaireLabel}>Commentaire de séance</label>
      <textarea
        value={texte}
        onChange={(e) => { setTexte(e.target.value); setEtat(null); }}
        style={s.textarea}
        rows={3}
        placeholder="Ressenti général, conditions, points travaillés…"
      />
      {(modifie || etat) && (
        <div style={s.commentaireActions}>
          {etat === "ok"     && <span style={s.commentaireOk}>✓ Enregistré</span>}
          {etat === "erreur" && <span style={s.commentaireErr}>Échec de l'enregistrement</span>}
          {modifie && (
            <button style={s.enregistrerBtn} onClick={enregistrer} disabled={etat === "envoi"}>
              {etat === "envoi" ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "14px" },

  liste: { display: "flex", flexDirection: "column", gap: "10px" },
  sessionCard: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "6px",
    textAlign: "left", cursor: "pointer", fontFamily: "inherit",
  },
  sessionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px 12px" },
  sessionDate: { fontFamily: "var(--display)", fontSize: "15px", fontWeight: "600", color: "var(--text)" },
  sessionMeta: { fontSize: "12px", color: "var(--text-muted)" },
  typeBadge: { borderRadius: "5px", padding: "2px 8px", fontSize: "11px", fontWeight: "700" },

  sessionExercices: { display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" },
  exoLigne: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" },
  exoNom: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)" },
  exoResultat: { fontFamily: "var(--mono)", fontSize: "13px", fontWeight: "700" },

  chiffres: {
    display: "flex", flexWrap: "wrap", gap: "6px 16px",
    borderTop: "1px solid var(--border)", paddingTop: "8px", marginTop: "4px",
  },
  chiffre: { display: "flex", flexDirection: "column", gap: "1px" },
  chiffreLabel: { fontSize: "10px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" },
  chiffreValeur: { fontFamily: "var(--mono)", fontSize: "14px", fontWeight: "700", color: "var(--text)" },

  sessionCommentaire: { fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4 },
  sessionRetourTexte: { fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 },

  sessionRetour: {
    alignSelf: "flex-start", fontSize: "11px", fontWeight: "700", color: PINK,
    backgroundColor: "var(--pink-soft)", borderRadius: "5px", padding: "2px 8px",
  },
  retourCoachBox: {
    backgroundColor: "var(--pink-soft)", border: `1px solid ${PINK}`, borderRadius: "12px",
    padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px",
  },
  retourCoachLabel: {
    fontSize: "11px", fontWeight: "700", color: PINK, margin: 0,
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  retourCoachTexte: { fontSize: "14px", color: "var(--text)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-line" },

  commentaireBox: { display: "flex", flexDirection: "column", gap: "6px" },
  commentaireLabel: {
    fontSize: "11px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  textarea: {
    padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "9px",
    fontSize: "14px", color: "var(--text)", outline: "none",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)",
    width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: "70px", lineHeight: 1.4,
  },
  commentaireActions: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" },
  commentaireOk:  { fontSize: "12px", color: "var(--text-muted)" },
  commentaireErr: { fontSize: "12px", color: PINK },
  enregistrerBtn: {
    backgroundColor: PINK, color: "#fff", border: "none", borderRadius: "8px",
    padding: "8px 16px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
  },

  retourBtn: {
    alignSelf: "flex-start", background: "none", border: "none",
    color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
    padding: "4px 0",
  },
  detailHead: { display: "flex", flexDirection: "column", gap: "2px" },
  detailDate: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600", color: "var(--text)", margin: 0 },
  detailMeta: { fontSize: "13px", color: "var(--text-muted)", margin: 0 },

  exerciceListe: { display: "flex", flexDirection: "column", gap: "1px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" },
  exerciceRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
    backgroundColor: "var(--surface)", border: "none", cursor: "pointer", fontFamily: "inherit",
    padding: "14px 16px", textAlign: "left",
  },
  exerciceNom:      { fontSize: "14px", fontWeight: "700", color: "var(--text)", flex: "1 1 auto" },
  exerciceResultat: { fontFamily: "var(--mono)", fontSize: "15px", fontWeight: "700", color: PINK },
  exerciceModifier: { fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" },

  empty: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "40px", textAlign: "center",
    color: "var(--text-dim)", fontSize: "14px",
  },
  info:   { color: "var(--text-muted)", fontSize: "14px" },
  errMsg: {
    color: PINK, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PINK}`,
  },
};
