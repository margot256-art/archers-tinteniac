import { useState } from "react";
import { PRIMARY, getPaille, getBlason, getCompte, fmtDateLongue, normFactor } from "../../utils/seances";
import { PROTOCOLE_PAR_ID, protocoleDe, indicateurExercice, resultatAvecMoyenne, commentaireSeanceDe, commentaireExerciceDe } from "../../utils/exercices";
import { couleurZone } from "../../utils/blason";
import { epreuveStandard, flechesParVolee, resumeTir, dispersion, reussite, SEUIL_REUSSITE_DEFAUT, libelleSeuil } from "../../utils/tirCompte";
import BlasonImpacts from "../archer/exercices/BlasonImpacts";

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

// Détail complet d'un exercice (feuille de marque et blason pour le tir compté),
// partagé avec le Journal de l'archer, qui y ajoute un bouton « Modifier ».
// `compact` (séance en cours) : seulement les chiffres clés, sans feuille de
// marque, blason ni liste des volées.
export function CarteExercice({ doc: d, onModifier, compact = false }) {
  const proto    = protocoleDe(d);
  const resultat = resultatAvecMoyenne(d);
  const detail   = indicateurExercice(proto, d)?.detail;
  const total    = getPaille(d) + getBlason(d) + getCompte(d);

  return (
    <div style={s.carte}>
      <div style={s.carteHead}>
        <span style={s.carteNom}>{nomExercice(d)}</span>
        <span style={s.carteDroite}>
          {resultat && <span style={s.carteResultat}>{resultat}</span>}
          {onModifier && <button style={s.modifierBtn} onClick={onModifier}>✎ Modifier</button>}
        </span>
      </div>
      {detail && <p style={s.detail}>{detail}</p>}
      {proto === "manuel" && total > 0 && (
        <p style={s.detail}>
          {[["Paille", getPaille(d)], ["Blason", getBlason(d)], ["Compté", getCompte(d)]]
            .filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(" · ")}
        </p>
      )}

      {proto === "tir-compte" && d.volees?.length > 0 && <DetailTirCompte doc={d} compact={compact} />}

      {proto === "volume" && total > 0 && (
        <p style={s.detail}>
          Paille {getPaille(d)} fl. · Blason {getBlason(d)} fl.
          {d.volees?.length > 0 && ` · ${d.volees.length} volée${d.volees.length > 1 ? "s" : ""}`}
        </p>
      )}
      {proto === "volume" && !compact && d.volees?.length > 0 && (
        <p style={s.detail}>
          Volées : {d.volees.map((v) => `${v.fleches}${v.support === "paille" ? " (paille)" : ""}`).join(" · ")}
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

  const fleches = d.volees.flatMap((v) =>
    (v.codes ?? []).map((code, i) => (v.impacts?.[i] ? { code, ...v.impacts[i] } : null)).filter(Boolean)
  );
  const disp = dispersion(d.volees.map((v) => v.impacts ?? []));
  const seuil = d.zoneReussite ?? SEUIL_REUSSITE_DEFAUT;
  const zone  = reussite(volees, seuil, reglages.voleesParSerie);

  const groupes = resume.series
    ? resume.series.filter((se) => se.volees.length > 0).map((se) => ({ titre: `Série ${se.numero}`, score: `${se.total}/${se.max}`, volees: se.volees }))
    : [{ titre: null, score: null, volees: resume.volees }];

  return (
    <div style={s.tirCompte}>
      <p style={s.stats}>
        {resume.x} X · {resume.dixPlusX} 10+X · {resume.manques} manqué{resume.manques > 1 ? "s" : ""}
        {resume.moyenne != null && ` · ≈ ${Math.round(resume.moyenne * normFactor(d.distance))} sur ${normFactor(d.distance) * 10}`}
      </p>
      {zone.pct != null && (
        <p style={s.stats}>
          Zone de réussite « {libelleSeuil(seuil)} » : {zone.pct} % ({zone.dans}/{zone.total})
          {zone.parSerie?.length > 1 && ` · ${zone.parSerie.map((se) => `S${se.numero} ${se.pct} %`).join(" · ")}`}
        </p>
      )}

      {compact ? (
        resume.series && resume.series.filter((se) => se.volees.length > 0).length > 0 && (
          <p style={s.stats}>
            {resume.series.filter((se) => se.volees.length > 0)
              .map((se) => `Série ${se.numero} : ${se.total}/${se.max}`).join(" · ")}
          </p>
        )
      ) : (
      <div style={s.tirCompteGrille}>
        <div style={s.feuille}>
          {groupes.map((g, gi) => (
            <div key={gi} style={s.serie}>
              {g.titre && (
                <div style={s.serieHead}>
                  <span style={s.serieNom}>{g.titre}</span>
                  <span style={s.serieScore}>{g.score}</span>
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

        {fleches.length > 0 && (
          <div style={s.blasonBox}>
            <BlasonImpacts fleches={fleches} />
            {disp && (
              <p style={s.detail}>
                {disp.n} impact{disp.n > 1 ? "s" : ""} placé{disp.n > 1 ? "s" : ""} · rayon moyen ≈ {disp.rayonMoyen.toFixed(1)} zone
              </p>
            )}
          </div>
        )}
      </div>
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
  carteResultat: { fontFamily: "var(--mono)", fontSize: "15px", fontWeight: "700", color: PRIMARY },
  carteDroite: { display: "inline-flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" },
  modifierBtn: {
    background: "none", border: "1px solid var(--border-3)", borderRadius: "7px", color: "var(--text-muted)",
    padding: "4px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  texte:  { fontSize: "14px", color: "var(--text-2)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-line" },
  detail: { fontSize: "12px", color: "var(--text-dim)", margin: 0 },
  commentaire: { fontSize: "13px", color: "var(--text-2)", fontStyle: "italic", margin: 0, lineHeight: 1.5 },

  tirCompte: { display: "flex", flexDirection: "column", gap: "10px" },
  stats: { fontSize: "12px", color: "var(--text-muted)", margin: 0, fontWeight: "600" },
  tirCompteGrille: { display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "flex-start" },
  feuille: { flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "10px" },
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
  blasonBox: { flex: "0 1 240px", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", margin: "0 auto" },

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
