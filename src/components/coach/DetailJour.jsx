import { useState } from "react";
import { PRIMARY, BLUE, getPaille, getBlason, getCompte, fmtDateLongue, normFactor } from "../../utils/seances";
import { PROTOCOLE_PAR_ID, protocoleDe, indicateurExercice, commentaireSeanceDe, commentaireExerciceDe } from "../../utils/exercices";
import { couleurZone } from "../../utils/blason";
import { epreuveStandard, flechesParVolee, resumeTir, reussite, SEUIL_REUSSITE_DEFAUT, comptagesTir } from "../../utils/tirCompte";
import BlasonImpacts from "../archer/exercices/BlasonImpacts";
import TrispotImpacts from "../archer/exercices/TrispotImpacts";
import { tirSurTrispot } from "../archer/exercices/cibleBlason";

const nomExercice = (s) => PROTOCOLE_PAR_ID[protocoleDe(s)]?.nom ?? s.protocole ?? "—";

// Détail d'une journée d'un archer dans le Journal coach : chaque exercice
// (feuille de score et blason pour le Tir compté), les commentaires de
// l'archer, et le retour du coach.
export default function DetailJour({ ligne, onRetour, onEnregistrerRetour }) {
  const commentairesSeance = [...new Set(ligne.docs.map(commentaireSeanceDe).filter(Boolean))];
  const retourInitial = ligne.docs.find((d) => d.retourCoach)?.retourCoach ?? "";

  return (
    <div style={s.page}>
      <button style={s.retourBtn} onClick={onRetour}>← Retour au journal</button>

      <div style={s.head}>
        <h2 style={s.titre}>{ligne.archer}</h2>
        <p style={s.meta}>
          {fmtDateLongue(ligne.date, true)} · {ligne.distance} · {ligne.type}{ligne.lieu ? ` · ${ligne.lieu}` : ""}
        </p>
      </div>

      {commentairesSeance.length > 0 && (
        <div style={s.carte}>
          <p style={s.carteLabel}>Commentaire de séance</p>
          {commentairesSeance.map((c, i) => <p key={i} style={s.texte}>{c}</p>)}
        </div>
      )}

      {ligne.docs.map((d) => <CarteExercice key={d.id} doc={d} />)}

      <RetourCoach key={ligne.id} initial={retourInitial} onEnregistrer={onEnregistrerRetour} />
    </div>
  );
}

// Couleur du type de séance : rose pour un entraînement, bleu pour une compétition.
const couleurDe = (d) => (d.type === "Compétition" ? BLUE : PRIMARY);

/** Un chiffre clé : la valeur en avant, son libellé discret en dessous. */
function Stat({ label, valeur }) {
  return (
    <span style={s.stat}>
      <span style={s.statValeur}>{valeur}</span>
      <span style={s.statLabel}>{label}</span>
    </span>
  );
}

// Détail d'un exercice, partagé avec le Journal de l'archer (qui y ajoute un
// bouton « Modifier ») et l'écran de la séance en cours (`compact`).
// Ordre : résultat → chiffres clés → blason / trispot et groupement → feuille de
// marque, repliée (« Feuille de marque · 20 volées »). En `compact` : chiffres clés
// et séries seulement. Le rose (bleu en compétition) est réservé aux scores.
export function CarteExercice({ doc: d, onModifier, compact = false }) {
  const proto     = protocoleDe(d);
  const resultat  = indicateurExercice(proto, d)?.texte;
  const total     = getPaille(d) + getBlason(d) + getCompte(d);
  const avecScore = getCompte(d) > 0 && (d.score ?? 0) > 0;

  return (
    <div style={s.carte}>
      <div style={s.carteHead}>
        <span style={s.carteNom}>{nomExercice(d)}</span>
        <span style={s.carteDroite}>
          {resultat && <span style={{ ...s.carteResultat, color: avecScore ? couleurDe(d) : "var(--text)" }}>{resultat}</span>}
          {onModifier && <button style={s.modifierBtn} onClick={onModifier}>✎ Modifier</button>}
        </span>
      </div>

      {proto === "tir-compte" && d.volees?.length > 0 && <DetailTirCompte doc={d} compact={compact} />}

      {proto === "manuel" && total > 0 && (
        <div style={s.stats}>
          {[["Paille", getPaille(d)], ["Blason", getBlason(d)], ["Compté", getCompte(d)]]
            .filter(([, n]) => n > 0).map(([l, n]) => <Stat key={l} label={l} valeur={n} />)}
          {avecScore && <Stat label="Moy." valeur={(d.score / getCompte(d)).toFixed(2)} />}
        </div>
      )}

      {proto === "volume" && total > 0 && (
        <p style={s.detail}>
          {[
            ...[["Paille", getPaille(d)], ["Blason", getBlason(d)]].filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n} fl.`),
            ...(d.volees?.length > 0 ? [`${d.volees.length} volée${d.volees.length > 1 ? "s" : ""}`] : []),
          ].join(" · ")}
        </p>
      )}

      {commentaireExerciceDe(d) && (
        <p style={s.commentaire}>« {commentaireExerciceDe(d)} »</p>
      )}
    </div>
  );
}

function DetailTirCompte({ doc: d, compact = false }) {
  const volees  = d.volees.map((v) => v.codes ?? []);
  const reglages = d.format === "libre"
    ? { flechesParVolee: flechesParVolee(d.distance), voleesParSerie: null, nbSeries: null }
    : { ...epreuveStandard(d.distance), nbSeries: d.nbSeries ?? 2 };
  const resume = resumeTir(volees, reglages);
  const base   = normFactor(d.distance);

  const fleches = d.volees.flatMap((v) =>
    (v.codes ?? []).map((code, i) => (v.impacts?.[i] ? { code, ...v.impacts[i] } : null)).filter(Boolean)
  );
  const trispot = tirSurTrispot(d);
  const seuil = d.zoneReussite ?? SEUIL_REUSSITE_DEFAUT;
  const zone  = reussite(volees, seuil, reglages.voleesParSerie);
  const series = (resume.series ?? []).filter((se) => se.volees.length > 0);

  const chiffres = [
    ["Moy.", resume.moyenne != null ? resume.moyenne.toFixed(2) : "—"],
    ["Flèches", resume.fleches],
    ...comptagesTir(d.distance, resume),
    ["Manqués", resume.manques],
    ...(resume.moyenne != null ? [[`Sur ${base * 10}`, `≈ ${Math.round(resume.moyenne * base)}`]] : []),
    ...(zone.pct != null ? [[`Zone ${seuil === "X" ? "X" : `${seuil}+`}`, `${zone.pct} %`]] : []),
  ];

  const groupes = series.length
    ? series.map((se) => ({ titre: `Série ${se.numero}`, score: `${se.total}/${se.max}`, volees: se.volees }))
    : [{ titre: null, score: null, volees: resume.volees }];

  return (
    <div style={s.tirCompte}>
      <div style={s.stats}>
        {chiffres.map(([l, v]) => <Stat key={l} label={l} valeur={v} />)}
      </div>

      {series.length > 0 && (
        <div style={s.seriesLigne}>
          {series.map((se, i) => (
            <span key={se.numero}>
              Série {se.numero} <strong style={{ color: couleurDe(d) }}>{se.total}</strong>/{se.max}
              {zone.parSerie?.[i] && <span style={s.seriesZone}> · zone {zone.parSerie[i].pct} %</span>}
            </span>
          ))}
        </div>
      )}

      {!compact && fleches.length > 0 && (
        <div style={s.blasonBox}>
          {trispot ? <TrispotImpacts volees={d.volees} /> : <BlasonImpacts fleches={fleches} />}
        </div>
      )}

      {!compact && (
        <details style={s.feuilleDetails}>
          <summary style={s.feuilleResume}>
            Feuille de marque · {volees.length} volée{volees.length > 1 ? "s" : ""}
          </summary>
          <div style={s.feuille}>
            {groupes.map((g, gi) => (
              <div key={gi} style={s.serie}>
                {g.titre && (
                  <div style={s.serieHead}>
                    <span style={s.serieNom}>{g.titre}</span>
                    <span style={{ ...s.serieScore, color: couleurDe(d) }}>{g.score}</span>
                  </div>
                )}
                {g.volees.map((v) => (
                  <div key={v.index} style={s.voleeRow}>
                    <span style={s.voleeNum}>V{v.index + 1}</span>
                    <span style={s.pastilles}>
                      {v.codes.map((c, i) => {
                        const col = couleurZone(c);
                        return <span key={i} style={{ ...s.pastille, backgroundColor: col.bg, color: col.text }}>{c}</span>;
                      })}
                    </span>
                    <span style={s.voleeTotal}>{v.total}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RetourCoach({ initial, onEnregistrer }) {
  const [texte, setTexte] = useState(initial);
  const [etat,  setEtat]  = useState(null); // null | "envoi" | "ok" | "erreur"

  const modifie = texte.trim() !== (initial ?? "").trim();

  const enregistrer = async () => {
    setEtat("envoi");
    try {
      await onEnregistrer(texte);
      setEtat("ok");
    } catch (err) {
      console.error("[DetailJour] erreur retour coach :", err);
      setEtat("erreur");
    }
  };

  return (
    <div style={{ ...s.carte, borderColor: PRIMARY }}>
      <label style={s.carteLabel}>Retour du coach — visible par l'archer</label>
      <textarea
        value={texte}
        onChange={(e) => { setTexte(e.target.value); setEtat(null); }}
        style={s.textarea}
        rows={3}
        placeholder="Points positifs, axes de travail pour la prochaine séance…"
      />
      {(modifie || etat) && (
        <div style={s.actions}>
          {etat === "ok"     && <span style={s.ok}>✓ Enregistré</span>}
          {etat === "erreur" && <span style={s.err}>Échec de l'enregistrement</span>}
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
  page: { display: "flex", flexDirection: "column", gap: "14px", maxWidth: "860px" },
  retourBtn: {
    alignSelf: "flex-start", background: "none", border: "none",
    color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", padding: "4px 0",
  },
  head:  { display: "flex", flexDirection: "column", gap: "2px" },
  titre: { fontFamily: "var(--display)", fontSize: "20px", fontWeight: "600", color: "var(--text)", margin: 0 },
  meta:  { fontSize: "13px", color: "var(--text-muted)", margin: 0 },

  carte: {
    backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: "8px",
  },
  carteLabel: {
    fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", margin: 0,
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  carteHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px" },
  carteNom: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  carteResultat: { fontFamily: "var(--display)", fontSize: "18px", fontWeight: "600", color: PRIMARY },
  carteDroite: { display: "inline-flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" },
  modifierBtn: {
    background: "none", border: "1px solid var(--border-3)", borderRadius: "7px", color: "var(--text-muted)",
    padding: "4px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  texte:  { fontSize: "14px", color: "var(--text-2)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-line" },
  detail: { fontSize: "12px", color: "var(--text-dim)", margin: 0 },
  commentaire: { fontSize: "13px", color: "var(--text-2)", fontStyle: "italic", margin: 0, lineHeight: 1.5 },

  tirCompte: { display: "flex", flexDirection: "column", gap: "10px" },
  stats: { display: "flex", flexWrap: "wrap", gap: "10px 18px" },
  stat: { display: "flex", flexDirection: "column", gap: "1px", minWidth: "44px" },
  statValeur: { fontSize: "15px", fontWeight: "700", color: "var(--text)", lineHeight: 1.2 },
  statLabel: { fontSize: "11px", color: "var(--text-muted)" },
  seriesLigne: { display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: "13px", color: "var(--text-muted)" },
  seriesZone: { color: "var(--text-dim)" },
  feuilleDetails: { borderTop: "1px solid var(--border)", paddingTop: "10px" },
  feuilleResume: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)", cursor: "pointer" },
  feuille: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" },
  serie: { display: "flex", flexDirection: "column", gap: "4px" },
  serieHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  serieNom: { fontSize: "11px", fontWeight: "700", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" },
  serieScore: { fontFamily: "var(--mono)", fontSize: "13px", fontWeight: "700", color: PRIMARY },
  voleeRow: { display: "flex", alignItems: "center", gap: "10px", padding: "4px 0", borderBottom: "1px solid var(--border)" },
  voleeNum: { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", width: "28px", flexShrink: 0 },
  pastilles: { display: "flex", gap: "4px", flexWrap: "wrap", flex: "1 1 auto" },
  pastille: {
    fontFamily: "var(--mono)", fontSize: "11px", fontWeight: "700",
    borderRadius: "5px", padding: "2px 6px", border: "1px solid rgba(0,0,0,0.25)",
  },
  voleeTotal: { fontFamily: "var(--mono)", fontSize: "13px", fontWeight: "700", color: "var(--text)" },
  blasonBox: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", width: "100%", maxWidth: "260px", margin: "0 auto" },

  textarea: {
    padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "9px",
    fontSize: "14px", color: "var(--text)", outline: "none",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)",
    width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: "70px", lineHeight: 1.4,
  },
  actions: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" },
  ok:  { fontSize: "12px", color: "var(--text-muted)" },
  err: { fontSize: "12px", color: PRIMARY },
  enregistrerBtn: {
    backgroundColor: PRIMARY, color: "#fff", border: "none", borderRadius: "8px",
    padding: "8px 16px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
  },
};
