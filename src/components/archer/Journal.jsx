import { useState, useMemo, useEffect } from "react";
import { useSeances } from "../../hooks/useSeances";
import { useAuth } from "../../hooks/useAuth";
import { lireSeanceEnCours, effacerSeanceEnCours } from "../../utils/seanceEnCours";
import { effacerBrouillonsDeSeance } from "../../utils/brouillonExercice";
import { PRIMARY as PINK, BLUE, getCompte, buildMonthTotals, fmtDate, fmtYM, getSaison, CURRENT_SAISON, todayISO, retourNonLu } from "../../utils/seances";
import { PROTOCOLES_ACTIFS, PROTOCOLE_PAR_ID, protocoleDe, resultatAvecMoyenne, commentaireSeanceDe, commentaireExerciceDe } from "../../utils/exercices";
import { CarteExercice } from "../coach/DetailJour";

const estCompet = (type) => type === "Compétition";
const couleurType = (type) => (estCompet(type) ? BLUE : PINK);
const fondType    = (type) => (estCompet(type) ? "var(--blue-soft)" : "var(--pink-soft)");
const nomExercice = (d) => PROTOCOLE_PAR_ID[protocoleDe(d)]?.nom ?? d.protocole;
const estManuel   = (d) => protocoleDe(d) === "manuel";

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const nouveauSeanceId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
import { COMPOSANTS_EXERCICE } from "./exercices/index.js";
import BoutonSupprimer from "./exercices/BoutonSupprimer";
import FilterSelect from "../shared/FilterSelect";

export default function Journal({ seanceInitiale = null }) {
  const { user } = useAuth();
  const { seances, loading, error, updateCommentaireSeance, modifierSeance, supprimerSeance } = useSeances();
  const [ouverte,    setOuverte]    = useState(seanceInitiale); // clé de séance ouverte, ou null
  const [editingDoc, setEditingDoc] = useState(null); // doc en cours d'édition, ou null
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreurSuppression,  setErreurSuppression]  = useState(null);
  const [filterSaison,       setFilterSaison]       = useState(CURRENT_SAISON);
  const [ajout,              setAjout]              = useState(null);  // null | "choix" | id de protocole à ajouter
  const [editionInfos,       setEditionInfos]       = useState(false);
  const [vue,                setVue]                = useState("seances"); // "seances" | "commentaires"

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
        const commentaireSeance = tries.map(commentaireSeanceDe).find(Boolean) ?? "";
        const retourCoach = tries.find((d) => d.retourCoach)?.retourCoach ?? "";
        const commentairesExercices = tries
          .filter((d) => commentaireExerciceDe(d))
          .map((d) => ({ id: d.id, nom: nomExercice(d), texte: commentaireExerciceDe(d) }));
        const { tp, tb, ts, tmoy, tscoreMoy } = buildMonthTotals(tries);
        const compte = tries.reduce((n, d) => n + getCompte(d), 0);
        const chiffres = {
          paille: tp, blason: tb, compte, total: tp + tb + compte,
          score: ts, moyenne: tmoy, scoreMoy: tscoreMoy,
        };
        return { cle, seanceId: premier.seanceId ?? null, docs: tries, date: premier.date, distance: premier.distance, type: premier.type, lieu: premier.lieu, commentaireSeance, retourCoach, retourNonLu: tries.some(retourNonLu), commentairesExercices, chiffres };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [seances]);

  const saisonOptions = useMemo(() => {
    const set = new Set(sessions.map((x) => getSaison(x.date)));
    set.add(CURRENT_SAISON);
    return ["Toutes", ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [sessions]);

  // Séances de la saison choisie, regroupées par mois (le plus récent d'abord),
  // avec les totaux du mois en tête de chaque groupe.
  const mois = useMemo(() => {
    const map = new Map();
    for (const sess of sessions) {
      if (filterSaison !== "Toutes" && getSaison(sess.date) !== filterSaison) continue;
      const ym = sess.date.slice(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(sess);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, liste]) => {
        const docs = liste.flatMap((x) => x.docs);
        const { tp, tb } = buildMonthTotals(docs);
        const compte = docs.reduce((n, d) => n + getCompte(d), 0);
        // Scores séparés : un entraînement et une compétition ne se comparent pas.
        const parType = (type) => {
          const docsType = docs.filter((d) => estCompet(d.type) === (type === "Compétition"));
          const t = buildMonthTotals(docsType);
          const c = docsType.reduce((n, d) => n + getCompte(d), 0);
          return {
            type, paille: t.tp, blason: t.tb, compte: c, total: t.tp + t.tb + c,
            moyenne: t.tmoy, scoreMoy: t.tscoreMoy,
          };
        };
        return {
          ym, liste,
          totaux: {
            seances: liste.length, total: tp + tb + compte,
            types: [parType("Entraînement"), parType("Compétition")].filter((x) => x.total > 0),
          },
        };
      });
  }, [sessions, filterSaison]);

  // Historique des commentaires : séances de la saison choisie qui portent au moins
  // un commentaire (de l'archer, du coach ou d'un exercice), la plus récente d'abord.
  const avecCommentaires = sessions.filter((x) =>
    (filterSaison === "Toutes" || getSaison(x.date) === filterSaison)
    && (x.commentaireSeance || x.retourCoach || x.commentairesExercices.length > 0));

  // Ouvrir une séance qui a un retour du coach non lu le marque comme lu
  // (la pastille de l'onglet Journal et l'encart de l'accueil disparaissent).
  useEffect(() => {
    const ids = sessions.find((x) => x.cle === ouverte)?.docs.filter(retourNonLu).map((d) => d.id) ?? [];
    if (ids.length) modifierSeance(ids, { retourCoachLu: true });
  }, [ouverte, sessions, modifierSeance]);

  if (loading) return <div style={s.info}>Chargement…</div>;
  if (error)   return <div style={s.errMsg}>{error}</div>;

  const session = sessions.find((x) => x.cle === ouverte);
  const infosSeance = session && { date: session.date, distance: session.distance, type: session.type, lieu: session.lieu ?? "" };

  // ── Édition d'un exercice de la séance ──────────────────────────────────
  // Les infos communes (date, distance…) se modifient au niveau de la séance :
  // on les passe à l'exercice pour qu'il ne les propose pas en double.
  if (editingDoc) {
    const Composant = COMPOSANTS_EXERCICE[protocoleDe(editingDoc)];
    return (
      <Composant
        existant={editingDoc}
        seanceInfo={editingDoc.seanceId ? infosSeance : undefined}
        seanceId={editingDoc.seanceId}
        onTermine={() => setEditingDoc(null)}
        onAnnuler={() => setEditingDoc(null)}
      />
    );
  }

  // ── Ajout d'un exercice à une séance existante ──────────────────────────
  if (session && ajout && ajout !== "choix") {
    const Composant = COMPOSANTS_EXERCICE[ajout];
    return (
      <Composant
        seanceInfo={infosSeance}
        seanceId={session.seanceId}
        onTermine={() => setAjout(null)}
        onAnnuler={() => setAjout(null)}
      />
    );
  }

  // Une séance enregistrée seule (saisie manuelle, ancienne séance) n'a pas encore
  // d'identifiant de séance : on lui en donne un avant d'y rattacher un exercice.
  const choisirExercice = async (protocoleId) => {
    if (!session.seanceId) {
      const id = nouveauSeanceId();
      await modifierSeance(session.docs.map((d) => d.id), { seanceId: id });
      setOuverte(id);
    }
    setAjout(protocoleId);
  };

  // ── Détail d'une séance ──────────────────────────────────────────────────
  if (session) {
    return (
      <div style={s.page}>
        <button style={s.retourBtn} onClick={() => { setOuverte(null); setAjout(null); setEditionInfos(false); }}>← Retour au journal</button>

        {editionInfos ? (
          <InfosSeance
            initial={infosSeance}
            onAnnuler={() => setEditionInfos(false)}
            onEnregistrer={async (champs) => {
              await modifierSeance(session.docs.map((d) => d.id), champs);
              setEditionInfos(false);
            }}
          />
        ) : (
          <div style={s.detailHead}>
            <div style={s.detailTitreLigne}>
              <h2 style={s.detailDate}>{fmtDate(session.date)}</h2>
              <button style={s.lienBtn} onClick={() => setEditionInfos(true)}>✎ Modifier les infos</button>
            </div>
            <p style={s.detailMeta}>
              {session.distance} · {session.type}{session.lieu ? ` · ${session.lieu}` : ""}
            </p>
            <div style={s.chiffres}>
              {session.chiffres.paille > 0 && <Chiffre label="Paille" valeur={session.chiffres.paille} />}
              {session.chiffres.blason > 0 && <Chiffre label="Blason" valeur={session.chiffres.blason} />}
              {session.chiffres.compte > 0 && <Chiffre label="Compté" valeur={session.chiffres.compte} />}
              <Chiffre label="Total" valeur={`${session.chiffres.total} fl.`} />
              {session.chiffres.score > 0 && <Chiffre label="Score" valeur={session.chiffres.score} />}
              {session.chiffres.moyenne != null && <Chiffre label="Moy." valeur={session.chiffres.moyenne.toFixed(2)} />}
              {session.chiffres.scoreMoy != null && <Chiffre label="Score moy." valeur={session.chiffres.scoreMoy} couleur={couleurType(session.type)} />}
            </div>
          </div>
        )}

        {session.retourCoach && (
          <div style={s.retourCoachBox}>
            <p style={s.retourCoachLabel}>Retour du coach</p>
            <p style={s.retourCoachTexte}>{session.retourCoach}</p>
          </div>
        )}

        {session.docs.map((d) => (
          <CarteExercice key={d.id} doc={d} onModifier={() => setEditingDoc(d)} />
        ))}

        {ajout === "choix" ? (
          <div style={s.ajoutBox}>
            <span style={s.commentaireLabel}>Ajouter un exercice à cette séance</span>
            <div style={s.ajoutGrille}>
              {PROTOCOLES_ACTIFS.map((p) => (
                <button key={p.id} style={s.ajoutChoix} onClick={() => choisirExercice(p.id)}>{p.nom}</button>
              ))}
              <button style={s.lienBtn} onClick={() => setAjout(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <button style={s.ajoutBtn} onClick={() => setAjout("choix")}>＋ Ajouter un exercice</button>
        )}

        <CommentaireSeance
          key={session.cle}
          initial={session.commentaireSeance}
          onEnregistrer={async (texte) => {
            await updateCommentaireSeance(session.docs.map((d) => d.id), texte);
            // Ancienne saisie manuelle : son commentaire d'exercice est remplacé par celui de séance.
            const anciens = session.docs.filter((d) => estManuel(d) && d.commentaire).map((d) => d.id);
            if (anciens.length) await modifierSeance(anciens, { commentaire: null });
          }}
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
              // C'était la séance en cours : plus rien à reprendre depuis l'accueil.
              if (session.seanceId && lireSeanceEnCours(user?.id)?.seanceId === session.seanceId) {
                effacerSeanceEnCours(user?.id);
                effacerBrouillonsDeSeance(user?.id, session.seanceId);
              }
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
      <div style={s.filtreBar}>
        <FilterSelect label="Saison" value={filterSaison} options={saisonOptions} onChange={setFilterSaison} />
        <div style={s.bascule}>
          {[["seances", "Séances"], ["commentaires", "Commentaires"]].map(([id, label]) => (
            <button
              key={id}
              style={{ ...s.basculeBtn, ...(vue === id ? s.basculeBtnActif : {}) }}
              onClick={() => setVue(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {vue === "commentaires" ? (
        avecCommentaires.length === 0 ? (
          <div style={s.empty}>Aucun commentaire sur cette saison.</div>
        ) : (
          <div style={s.liste}>
            {avecCommentaires.map((sess) => {
              const couleur = couleurType(sess.type);
              return (
                <button key={sess.cle} style={{ ...s.sessionCard, borderLeft: `4px solid ${couleur}` }} onClick={() => setOuverte(sess.cle)}>
                  <div style={s.sessionHead}>
                    <span style={s.sessionDate}>{fmtDate(sess.date)}</span>
                    <span style={{ ...s.typeBadge, color: couleur, backgroundColor: fondType(sess.type) }}>{sess.type}</span>
                  </div>
                  <div style={s.sessionMeta}>{sess.distance}{sess.lieu ? ` · ${sess.lieu}` : ""}</div>

                  {sess.commentaireSeance && (
                    <div style={s.histoBloc}>
                      <span style={s.histoLabel}>Mon commentaire</span>
                      <span style={s.histoTexte}>{sess.commentaireSeance}</span>
                    </div>
                  )}
                  {sess.commentairesExercices.map((c) => (
                    <div key={c.id} style={s.histoBloc}>
                      <span style={s.histoLabel}>{c.nom}</span>
                      <span style={s.histoTexte}>{c.texte}</span>
                    </div>
                  ))}
                  {sess.retourCoach && (
                    <div style={s.histoBloc}>
                      <span style={s.sessionRetour}>Retour du coach</span>
                      <span style={s.histoTexte}>{sess.retourCoach}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )
      ) : mois.length === 0 ? (
        <div style={s.empty}>
          {sessions.length === 0 ? "Aucune séance pour l'instant." : "Aucune séance sur cette saison."}
        </div>
      ) : mois.map(({ ym, liste, totaux: m }) => (
        <section key={ym} style={s.moisSection}>
          <div style={s.moisHead}>
            <div style={s.moisTitreLigne}>
              <span style={s.moisTitre}>{fmtYM(ym)}</span>
              <span style={s.moisNb}>{m.seances} séance{m.seances > 1 ? "s" : ""}</span>
            </div>
            <div style={s.chiffres}>
              <Chiffre label="Total mois" valeur={`${m.total} fl.`} />
              {m.types.map((sc) => (
                <span key={sc.type} style={s.moisScores}>
                  <span style={{ ...s.typeBadge, color: couleurType(sc.type), backgroundColor: fondType(sc.type) }}>{sc.type}</span>
                  {sc.paille > 0 && <Chiffre label="Paille" valeur={sc.paille} />}
                  {sc.blason > 0 && <Chiffre label="Blason" valeur={sc.blason} />}
                  {sc.compte > 0 && <Chiffre label="Compté" valeur={sc.compte} />}
                  <Chiffre label="Total" valeur={`${sc.total} fl.`} />
                  {sc.moyenne != null && <Chiffre label="Moy." valeur={sc.moyenne.toFixed(2)} />}
                  {sc.scoreMoy != null && <Chiffre label="Score moy." valeur={sc.scoreMoy} couleur={couleurType(sc.type)} />}
                </span>
              ))}
            </div>
          </div>

        <div style={s.liste}>
          {liste.map((sess) => {
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
                    <span style={s.sessionRetour}>Retour du coach</span>
                    {sess.retourNonLu && <span style={s.nouveauBadge}>Nouveau</span>} {sess.retourCoach}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        </section>
      ))}
    </div>
  );
}

function InfosSeance({ initial, onEnregistrer, onAnnuler }) {
  const [date,     setDate]     = useState(initial.date);
  const [distance, setDistance] = useState(initial.distance);
  const [type,     setType]     = useState(initial.type);
  const [lieu,     setLieu]     = useState(initial.lieu);
  const [envoi,    setEnvoi]    = useState(false);
  const [erreur,   setErreur]   = useState(null);

  const enregistrer = async () => {
    if (!date || date > todayISO()) { setErreur("Date invalide."); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      await onEnregistrer({ date, distance, type, lieu: lieu.trim() || null });
    } catch (err) {
      console.error("[Journal] erreur modification séance :", err);
      setErreur("Impossible d'enregistrer. Réessayez.");
      setEnvoi(false);
    }
  };

  return (
    <div style={s.ajoutBox}>
      <span style={s.commentaireLabel}>Infos de la séance</span>
      <div className="form-grid-4">
        <label style={s.champ}>
          <span style={s.commentaireLabel}>Date</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={s.textarea} />
        </label>
        <label style={s.champ}>
          <span style={s.commentaireLabel}>Distance</span>
          <select value={distance} onChange={(e) => setDistance(e.target.value)} style={s.textarea}>
            {DISTANCES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label style={s.champ}>
          <span style={s.commentaireLabel}>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} style={s.textarea}>
            <option>Entraînement</option>
            <option>Compétition</option>
          </select>
        </label>
        <label style={s.champ}>
          <span style={s.commentaireLabel}>Lieu</span>
          <input type="text" value={lieu} onChange={(e) => setLieu(e.target.value)} style={s.textarea} placeholder="ex : Salle Tinténiac" />
        </label>
      </div>
      <p style={s.aideTexte}>S'applique à tous les exercices de la séance.</p>
      {erreur && <span style={s.commentaireErr}>{erreur}</span>}
      <div style={s.commentaireActions}>
        <button style={s.lienBtn} onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button style={s.enregistrerBtn} onClick={enregistrer} disabled={envoi}>
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
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

  filtreBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
  bascule: {
    display: "flex", gap: "2px", padding: "3px", borderRadius: "10px",
    backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)",
  },
  basculeBtn: {
    background: "none", border: "none", borderRadius: "8px", padding: "6px 12px",
    fontSize: "13px", fontWeight: "600", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
  },
  basculeBtnActif: { backgroundColor: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-card)" },

  histoBloc: {
    display: "flex", flexDirection: "column", gap: "4px",
    borderTop: "1px solid var(--border)", paddingTop: "8px", marginTop: "4px",
  },
  histoLabel: {
    fontSize: "10px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  histoTexte: { fontSize: "14px", color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-line" },
  moisSection: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" },
  moisHead: {
    backgroundColor: "var(--surface-raised)", borderRadius: "12px", border: "1px solid var(--border)",
    padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px",
  },
  moisTitreLigne: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" },
  moisTitre: { fontFamily: "var(--display)", fontSize: "16px", fontWeight: "600", color: "var(--text)", textTransform: "capitalize" },
  moisNb: { fontSize: "12px", fontWeight: "600", color: "var(--text-muted)" },
  moisScores: {
    display: "flex", alignItems: "center", gap: "6px 16px",
    borderLeft: "1px solid var(--border-2)", paddingLeft: "16px",
  },
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
  nouveauBadge: {
    marginLeft: "6px", fontSize: "10px", fontWeight: "700", color: "#fff",
    backgroundColor: "var(--bad)", borderRadius: "10px", padding: "1px 7px",
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
  detailTitreLigne: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  lienBtn: {
    background: "none", border: "none", color: "var(--text-muted)", fontSize: "13px", fontWeight: "600",
    cursor: "pointer", fontFamily: "inherit", padding: "4px 0",
  },
  ajoutBtn: {
    alignSelf: "flex-start", background: "none", border: "1.5px dashed var(--border-3)", borderRadius: "10px",
    color: "var(--text-2)", fontSize: "13px", fontWeight: "700", padding: "10px 16px",
    cursor: "pointer", fontFamily: "inherit",
  },
  ajoutBox: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px",
  },
  ajoutGrille: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" },
  ajoutChoix: {
    border: "1.5px solid var(--border-2)", borderRadius: "10px", padding: "10px 14px",
    backgroundColor: "var(--surface-raised)", color: "var(--text)", fontSize: "13px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
  champ: { display: "flex", flexDirection: "column", gap: "6px" },
  aideTexte: { fontSize: "12px", color: "var(--text-dim)", margin: 0 },
  detailDate: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600", color: "var(--text)", margin: 0 },
  detailMeta: { fontSize: "13px", color: "var(--text-muted)", margin: 0 },


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
