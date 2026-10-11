import { useState, useMemo, useEffect } from "react";
import { useSeances } from "../../hooks/useSeances";
import { useAuth } from "../../hooks/useAuth";
import { lireSeanceEnCours, effacerSeanceEnCours } from "../../utils/seanceEnCours";
import { effacerBrouillonsDeSeance } from "../../utils/brouillonExercice";
import { PRIMARY as PINK, BLUE, getCompte, buildMonthTotals, fmtYM, getSaison, CURRENT_SAISON, todayISO, retourNonLu, fmtDateLongue, jourDate, parOrdreDeTir } from "../../utils/seances";
import { PROTOCOLES_ACTIFS, PROTOCOLE_PAR_ID, protocoleDe, commentaireSeanceDe, commentaireExerciceDe } from "../../utils/exercices";
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
  const [filterDistance,     setFilterDistance]     = useState("Toutes");
  const [filterType,         setFilterType]         = useState("Tous");
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
        const tries = [...docs].sort(parOrdreDeTir);
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

  // Distances réellement tirées, dans l'ordre habituel.
  const distanceOptions = useMemo(() => {
    const presentes = new Set(sessions.map((x) => x.distance));
    return ["Toutes", ...DISTANCES.filter((d) => presentes.has(d))];
  }, [sessions]);

  // Séances retenues par les filtres Saison / Distance / Type.
  const retenue = (sess) =>
    (filterSaison === "Toutes" || getSaison(sess.date) === filterSaison)
    && (filterDistance === "Toutes" || sess.distance === filterDistance)
    && (filterType === "Tous" || sess.type === filterType);

  // Séances retenues, regroupées par mois (le plus récent d'abord),
  // avec les totaux du mois en tête de chaque groupe.
  const mois = useMemo(() => {
    const map = new Map();
    for (const sess of sessions) {
      if (!retenue(sess)) continue;
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
            seances: liste.length, total: tp + tb + compte, paille: tp, blason: tb, compte,
            types: [parType("Entraînement"), parType("Compétition")].filter((x) => x.total > 0),
          },
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `retenue` ne dépend que des filtres listés
  }, [sessions, filterSaison, filterDistance, filterType]);

  // Historique des commentaires : mêmes mois, séances qui portent au moins un
  // commentaire (de l'archer, du coach ou d'un exercice).
  const aCommentaire = (x) => x.commentaireSeance || x.retourCoach || x.commentairesExercices.length > 0;
  const moisCommentaires = mois
    .map(({ ym, liste }) => ({ ym, liste: liste.filter(aCommentaire) }))
    .filter((m) => m.liste.length > 0);

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
              <h2 style={s.detailDate}>{fmtDateLongue(session.date, true)}</h2>
              <button style={s.lienBtn} onClick={() => setEditionInfos(true)}>✎ Modifier les infos</button>
            </div>
            <p style={s.detailMeta}>
              {session.distance} · {session.type}{session.lieu ? ` · ${session.lieu}` : ""}
            </p>
            {/* Totaux de la séance : utiles seulement s'il y a plusieurs exercices
                (sinon la carte de l'exercice, juste en dessous, dit déjà tout). */}
            {/* Totaux de la séance (plusieurs exercices) : même style que la liste. */}
            {session.docs.length > 1 && (
              <p style={s.totauxSeance}>
                <strong style={s.totalFort}>{session.chiffres.total}</strong> flèches
                {[["paille", session.chiffres.paille], ["blason", session.chiffres.blason], ["compté", session.chiffres.compte]]
                  .filter(([, n]) => n > 0).map(([l, n]) => <span key={l}> · {l} {n}</span>)}
                {session.chiffres.moyenne != null && <span> · moy. <strong style={s.totalFort}>{session.chiffres.moyenne.toFixed(2)}</strong></span>}
                {session.chiffres.scoreMoy != null && (
                  <span> · score moy. <strong style={{ ...s.totalFort, color: couleurType(session.type) }}>{session.chiffres.scoreMoy}</strong></span>
                )}
              </p>
            )}
          </div>
        )}

        {session.commentaireSeance && (
          <div style={s.commentaireHaut}>
            <span style={s.commentaireHautTexte}>{session.commentaireSeance}</span>
            <button
              style={{ ...s.lienBtn, whiteSpace: "nowrap", flex: "0 0 auto" }}
              onClick={() => {
                const champ = document.getElementById("commentaire-seance");
                champ?.scrollIntoView({ block: "center" });
                champ?.focus({ preventScroll: true });
              }}
            >✎ Modifier</button>
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
      <div style={s.filtres}>
        <FilterSelect label="Saison" value={filterSaison} options={saisonOptions} onChange={setFilterSaison} />
        <FilterSelect label="Distance" value={filterDistance} options={distanceOptions} onChange={setFilterDistance} />
      </div>
      <div style={s.filtreBar}>
        {/* Type : un appui filtre, un second appui sur le même bouton revient à « tous ». */}
        <div style={s.bascule} role="group" aria-label="Type de séance">
          {["Entraînement", "Compétition"].map((type) => (
            <button
              key={type}
              style={{ ...s.basculeBtn, ...(filterType === type ? { ...s.basculeBtnActif, color: couleurType(type) } : {}) }}
              onClick={() => setFilterType(filterType === type ? "Tous" : type)}
              aria-pressed={filterType === type}
            >
              {type}
            </button>
          ))}
        </div>
        <div style={s.bascule} role="group" aria-label="Affichage">
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
        moisCommentaires.length === 0 ? (
          <div style={s.empty}>Aucun commentaire avec ces filtres.</div>
        ) : moisCommentaires.map(({ ym, liste }) => (
          <section key={ym} style={s.moisSection}>
            <div style={s.moisTitreLigne}>
              <span style={s.moisTitre}>{fmtYM(ym)}</span>
              <span style={s.moisNb}>{liste.length} séance{liste.length > 1 ? "s" : ""} commentée{liste.length > 1 ? "s" : ""}</span>
            </div>
            <div style={s.liste}>
              {liste.map((sess) => {
                const couleur = couleurType(sess.type);
                const j = jourDate(sess.date);
                return (
                  <button key={sess.cle} style={s.carte} onClick={() => setOuverte(sess.cle)}>
                    <span style={{ ...s.tuile, color: couleur, backgroundColor: fondType(sess.type) }}>
                      <span style={s.tuileJour}>{j.semaine}</span>
                      <span style={s.tuileNum}>{j.num}</span>
                    </span>
                    <span style={s.carteCorps}>
                      <span style={s.carteTitre}>{sess.lieu ? `${sess.lieu} · ${sess.distance}` : sess.distance}</span>
                      {sess.commentaireSeance && <span style={s.commentaireCarte}>{sess.commentaireSeance}</span>}
                      {sess.commentairesExercices.map((c) => (
                        <span key={c.id} style={s.commentaireExo}>
                          <span style={s.commentaireExoNom}>{c.nom}</span> {c.texte}
                        </span>
                      ))}
                      {sess.retourCoach && (
                        <span style={s.retour}>
                          <span style={s.retourTitre}>
                            Retour du coach{sess.retourNonLu && <span style={s.nouveauBadge}>Nouveau</span>}
                          </span>
                          <span style={s.retourTexteListe}>{sess.retourCoach}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      ) : mois.length === 0 ? (
        <div style={s.empty}>
          {sessions.length === 0 ? "Aucune séance pour l'instant." : "Aucune séance avec ces filtres."}
        </div>
      ) : mois.map(({ ym, liste, totaux: m }) => (
        <section key={ym} style={s.moisSection}>
          <div style={s.moisHead}>
            <div style={s.moisTitreLigne}>
              <span style={s.moisTitre}>{fmtYM(ym)}</span>
              <span style={s.moisNb}>
                {m.seances} séance{m.seances > 1 ? "s" : ""} · <strong style={s.moisFort}>{m.total}</strong> flèches
              </span>
            </div>
            <Repartition paille={m.paille} blason={m.blason} compte={m.compte} />
            {m.types.filter((sc) => sc.moyenne != null).map((sc) => (
              <div key={sc.type} style={s.moisScore}>
                <span style={{ ...s.typePoint, backgroundColor: couleurType(sc.type) }} />
                <span style={s.typeNom}>{sc.type}</span>
                <span>· moy. <strong style={s.moisFort}>{sc.moyenne.toFixed(2)}</strong> / flèche</span>
                {sc.scoreMoy != null && <span>· score moy. <strong style={{ ...s.moisFort, color: couleurType(sc.type) }}>{sc.scoreMoy}</strong></span>}
              </div>
            ))}
          </div>

          <div style={s.liste}>
            {liste.map((sess) => {
              const couleur = couleurType(sess.type);
              const c = sess.chiffres;
              const j = jourDate(sess.date);
              // À droite : le score (s'il y a du tir compté) et le total de flèches.
              // Plusieurs tirs comptés : leurs points ne s'additionnent pas, on montre le score moyen.
              const nbComptes = sess.docs.filter((d) => getCompte(d) > 0 && (d.score ?? 0) > 0).length;
              const score = nbComptes > 1 && c.scoreMoy != null ? { valeur: c.scoreMoy, unite: "score moy." }
                : c.score > 0 ? { valeur: c.score, unite: "pts" }
                : null;
              const details = [
                ...(c.score > 0 && c.moyenne != null ? [`moy. ${c.moyenne.toFixed(2)}`] : []),
                ...[["paille", c.paille], ["blason", c.blason], ["compté", c.compte]]
                  .filter(([, n]) => n > 0 && n < c.total).map(([l, n]) => `${l} ${n}`),
              ];
              const nbCommentairesExo = sess.commentairesExercices.length;
              return (
                <button key={sess.cle} style={s.carte} onClick={() => setOuverte(sess.cle)}>
                  <span style={{ ...s.tuile, color: couleur, backgroundColor: fondType(sess.type) }}>
                    <span style={s.tuileJour}>{j.semaine}</span>
                    <span style={s.tuileNum}>{j.num}</span>
                  </span>

                  <span style={s.carteCorps}>
                    <span style={s.carteTete}>
                      <span style={s.carteTitre}>{sess.lieu ? `${sess.lieu} · ${sess.distance}` : sess.distance}</span>
                    </span>
                    <span style={s.exos}>{resumeExercices(sess.docs)}</span>
                    {details.length > 0 && <span style={s.stats}>{details.join(" · ")}</span>}
                    {nbCommentairesExo > 0 && (
                      <span style={s.stats}>
                        💬 {nbCommentairesExo > 1 ? `${nbCommentairesExo} commentaires` : "commentaire"} d'exercice
                      </span>
                    )}

                    {sess.commentaireSeance && <span style={s.citation}>{sess.commentaireSeance}</span>}
                    {sess.retourCoach && (
                      <span style={s.retour}>
                        <span style={s.retourTitre}>
                          Retour du coach{sess.retourNonLu && <span style={s.nouveauBadge}>Nouveau</span>}
                        </span>
                        <span style={s.retourTexteListe}>{sess.retourCoach}</span>
                      </span>
                    )}
                  </span>

                  <span style={s.cle}>
                    {score && (
                      <>
                        <span style={{ ...s.cleValeur, color: couleur }}>{score.valeur}</span>
                        <span style={s.cleUnite}>{score.unite}</span>
                      </>
                    )}
                    <span style={score ? s.cleFleches : { ...s.cleFleches, marginTop: 0 }}>{c.total}</span>
                    <span style={s.cleUnite}>flèches</span>
                  </span>
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

// « Volume ×3 · Tir compté ×2 » : exercices d'une séance, dans l'ordre de leur premier tir.
function resumeExercices(docs) {
  const nb = new Map();
  for (const d of docs) nb.set(nomExercice(d), (nb.get(nomExercice(d)) ?? 0) + 1);
  return [...nb].map(([nom, n]) => (n > 1 ? `${nom} ×${n}` : nom)).join(" · ");
}

// Barre de répartition des flèches du mois (paille / blason / compté) avec légende.
// Couleurs propres, distinctes du rose / bleu qui marquent entraînement / compétition.
const COULEUR_SUPPORT = { paille: "#a78bfa", blason: "#ddd6fe", compte: "#6d28d9" }; // nuancier de violet, luminosités bien écartées
function Repartition({ paille, blason, compte }) {
  const total = paille + blason + compte;
  if (!total) return null;
  const parts = [
    { label: "Paille", n: paille, couleur: COULEUR_SUPPORT.paille },
    { label: "Blason", n: blason, couleur: COULEUR_SUPPORT.blason },
    { label: "Compté", n: compte, couleur: COULEUR_SUPPORT.compte },
  ].filter((x) => x.n > 0);
  return (
    <div style={s.repartition}>
      <div style={s.repartitionBarre}>
        {parts.map((x) => <span key={x.label} style={{ width: `${(x.n / total) * 100}%`, backgroundColor: x.couleur }} />)}
      </div>
      <div style={s.repartitionLegende}>
        {parts.map((x) => (
          <span key={x.label} style={s.legendeItem}>
            <span style={{ ...s.legendePoint, backgroundColor: x.couleur }} />{x.label} {x.n}
          </span>
        ))}
      </div>
    </div>
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
        id="commentaire-seance"
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
  page: { display: "flex", flexDirection: "column", gap: "14px", width: "100%", maxWidth: "780px", margin: "0 auto" },

  liste: { display: "flex", flexDirection: "column", gap: "10px" },

  filtreBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
  bascule: {
    display: "flex", gap: "2px", padding: "3px", borderRadius: "10px",
    backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)",
  },
  basculeBtn: {
    backgroundColor: "transparent", border: "none", borderRadius: "8px", padding: "6px 12px",
    fontSize: "13px", fontWeight: "600", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
  },
  basculeBtnActif: { backgroundColor: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-card)" },

  moisSection: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" },
  moisFort: { fontWeight: "700", color: "var(--text)" },
  typePoint: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block", flex: "0 0 auto" },
  typeNom: { fontWeight: "600", color: "var(--text-2)" },
  filtres: { display: "flex", alignItems: "center", gap: "10px 14px", flexWrap: "wrap" },
  commentaireCarte: { fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5, whiteSpace: "pre-line" },
  commentaireExo: { fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, borderLeft: "2px solid var(--border-3)", paddingLeft: "9px" },
  commentaireExoNom: { fontWeight: "700", color: "var(--text-2)" },
  commentaireHaut: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
    borderLeft: "2px solid var(--border-3)", padding: "2px 0 2px 12px",
  },
  commentaireHautTexte: { fontSize: "14px", color: "var(--text-2)", fontStyle: "italic", lineHeight: 1.5, whiteSpace: "pre-line" },
  moisScore: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-muted)" },

  repartition: { display: "flex", flexDirection: "column", gap: "6px" },
  repartitionBarre: { display: "flex", height: "7px", borderRadius: "7px", overflow: "hidden", backgroundColor: "var(--input-bg)" },
  repartitionLegende: { display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "11px", color: "var(--text-muted)" },
  legendeItem: { display: "inline-flex", alignItems: "center", gap: "5px" },
  legendePoint: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },

  carte: {
    display: "flex", alignItems: "flex-start", gap: "14px", width: "100%",
    backgroundColor: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "14px 14px 14px 12px",
    textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
  },
  // Pastille de date aux couleurs du type de séance (rose entraînement, bleu compétition).
  tuile: {
    flex: "0 0 auto", width: "50px", borderRadius: "12px", padding: "7px 0 6px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "1px",
  },
  tuileJour: { fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em" },
  tuileNum: { fontFamily: "var(--display)", fontSize: "21px", fontWeight: "600", lineHeight: 1.05 },
  carteCorps: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "5px" },
  carteTete: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  carteTitre: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  exos: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)" },
  stats: { fontSize: "12px", color: "var(--text-muted)" },
  cle: { flex: "0 0 auto", alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: "64px" },
  // Score (un pixel de plus que les flèches) et total de flèches ; seul le score est en couleur.
  cleValeur: { fontFamily: "var(--display)", fontSize: "21px", fontWeight: "600", lineHeight: 1 },
  cleUnite: { fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", marginTop: "2px" },
  cleFleches: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600", color: "var(--text)", marginTop: "8px", lineHeight: 1 },
  citation: {
    fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.45,
    borderLeft: "2px solid var(--border-3)", paddingLeft: "9px",
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  retour: {
    display: "flex", flexDirection: "column", gap: "3px", backgroundColor: "var(--pink-soft)",
    borderRadius: "9px", padding: "8px 10px",
  },
  retourTitre: { fontSize: "10px", fontWeight: "700", color: PINK, textTransform: "uppercase", letterSpacing: "0.07em" },
  retourTexteListe: {
    fontSize: "12px", color: "var(--text-2)", lineHeight: 1.45,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  chevron: { flex: "0 0 auto", alignSelf: "center", fontSize: "22px", color: "var(--text-dim)", lineHeight: 1 },
  moisHead: {
    display: "flex", flexDirection: "column", gap: "8px", padding: "4px 2px 2px",
  },
  moisTitreLigne: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap" },
  moisTitre: { fontFamily: "var(--display)", fontSize: "19px", fontWeight: "600", color: "var(--text)", textTransform: "capitalize" },
  moisNb: { fontSize: "12px", fontWeight: "600", color: "var(--text-muted)" },
  moisScores: {
    display: "flex", alignItems: "center", gap: "6px 16px",
    borderLeft: "1px solid var(--border-2)", paddingLeft: "16px",
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
  totauxSeance: { fontSize: "13px", color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.6 },
  totalFort: { fontWeight: "700", color: "var(--text)" },
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
