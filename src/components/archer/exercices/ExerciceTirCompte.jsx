import { useState, useMemo, useEffect } from "react";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../hooks/useAuth";
import { useChartColors } from "../../../hooks/useChartColors";
import { normFactor } from "../../../utils/seances";
import { couleurZone } from "../../../utils/blason";
import { flechesParVolee, epreuveStandard, scoreVolee, resumeTir, positionEpreuve, dispersion } from "../../../utils/tirCompte";
import ZoneButtons from "./ZoneButtons";
import CibleSaisie from "./CibleSaisie";
import BoutonSupprimer from "./BoutonSupprimer";
import { exerciceStyles, PINK } from "./exerciceStyles";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const todayISO = () => new Date().toISOString().split("T")[0];

const CLE_MODE_SAISIE = "archers-tinteniac.modeSaisieTir";
function lireModeSaisie() {
  try { return localStorage.getItem(CLE_MODE_SAISIE) === "blason" ? "blason" : "clavier"; } catch { return "clavier"; }
}
function ecrireModeSaisie(mode) {
  try { localStorage.setItem(CLE_MODE_SAISIE, mode); } catch { /* stockage indisponible */ }
}

function texteDecalage({ x, y }) {
  const parts = [];
  if (x > 0.05) parts.push("à droite"); else if (x < -0.05) parts.push("à gauche");
  if (y > 0.05) parts.push("en bas"); else if (y < -0.05) parts.push("en haut");
  return parts.length ? parts.join(" et ") : "aucun (centré)";
}

export default function ExerciceTirCompte({ seanceInfo, seanceId, existant, onTermine, onAnnuler }) {
  const { user } = useAuth();
  const colors = useChartColors();
  const autonome = !seanceInfo;
  const enEdition = !!existant;

  const [date,     setDate]     = useState(existant?.date ?? seanceInfo?.date ?? todayISO());
  const [distance, setDistance] = useState(existant?.distance ?? seanceInfo?.distance ?? "18m");
  const [type,     setType]     = useState(existant?.type ?? seanceInfo?.type ?? "Entraînement");
  const [lieu,     setLieu]     = useState(existant?.lieu ?? seanceInfo?.lieu ?? "");
  const [commentaire, setCommentaire] = useState(existant?.commentaire ?? "");

  const [format,   setFormat]   = useState(existant?.format ?? "standard"); // "standard" | "libre"
  const [nbSeries, setNbSeries] = useState(existant?.nbSeries ?? 2);

  // Stockage Firestore : volees = [{ codes: [...], impacts: [...] }, ...] (Firestore interdit les
  // tableaux directement imbriqués dans un tableau — d'où l'enveloppe par objet). En mémoire, on
  // garde deux tableaux parallèles (codes / impacts) pour simplifier la logique de saisie.
  const voleesExistantes = existant?.volees ?? [];
  const [volees,  setVolees]  = useState(() => voleesExistantes.map((v) => v.codes ?? []));   // [[code, ...], ...] — volées validées
  const [impacts, setImpacts] = useState(() => voleesExistantes.map((v) => v.impacts ?? [])); // parallèle

  const [voleeEnCours,  setVoleeEnCours]  = useState([]);
  const [impactEnCours, setImpactEnCours] = useState([]);
  const [selection,     setSelection]     = useState(null); // index dans voleeEnCours en cours de correction

  const [modeSaisie, setModeSaisie] = useState(lireModeSaisie);
  useEffect(() => { ecrireModeSaisie(modeSaisie); }, [modeSaisie]);

  const [editIndex,     setEditIndex]     = useState(null); // volée déjà validée ouverte pour correction
  const [editSelection, setEditSelection] = useState(null); // flèche sélectionnée dans cette volée

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const fpv  = flechesParVolee(distance);
  const base = normFactor(distance);

  const reglages = useMemo(() => {
    if (format === "libre") return { flechesParVolee: fpv, voleesParSerie: null, nbSeries: null };
    return { ...epreuveStandard(distance), nbSeries };
  }, [format, distance, nbSeries, fpv]);

  const resume   = useMemo(() => resumeTir(volees, reglages), [volees, reglages]);
  const position = useMemo(() => positionEpreuve(volees.length, voleeEnCours.length, reglages), [volees.length, voleeEnCours.length, reglages]);
  const dispersionImpacts = useMemo(() => dispersion(impacts), [impacts]);

  const serieEnCours = reglages.voleesParSerie ? resume.series[Math.min(position.serie, resume.series.length) - 1] : null;
  const projection   = resume.moyenne != null ? Math.round(resume.moyenne * base) : null;

  const scoreAffiche = reglages.voleesParSerie && !position.terminee && serieEnCours ? serieEnCours.total : resume.total;
  const maxAffiche    = reglages.voleesParSerie
    ? (position.terminee ? resume.series.reduce((s, x) => s + x.max, 0) : serieEnCours?.max)
    : null;

  const saisieDisabled = selection === null && voleeEnCours.length >= fpv;

  const chartData = useMemo(() => ({
    labels: volees.map((_, i) => `V${i + 1}`),
    datasets: [{
      label: "Moy. / flèche", data: volees.map((v) => scoreVolee(v) / v.length),
      borderColor: PINK, backgroundColor: "rgba(255,0,122,0.12)", pointBackgroundColor: PINK,
      pointRadius: 4, pointHoverRadius: 6, tension: 0.3, fill: true,
    }],
  }), [volees]);

  const chartOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { ticks: { font: { size: 10 }, color: colors.dim }, grid: { display: false } },
      y: { beginAtZero: true, max: 10, ticks: { font: { size: 10 }, color: colors.dim, stepSize: 2 }, grid: { color: colors.grid } },
    },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(2)} pts/fl.` } } },
  }), [colors.theme]);

  const saisirCode = (code, impact = null) => {
    if (position.terminee) return;
    if (selection !== null) {
      const idx = selection;
      setVoleeEnCours((prev) => prev.map((c, i) => (i === idx ? code : c)));
      setImpactEnCours((prev) => prev.map((p, i) => (i === idx ? impact : p)));
      setSelection(null);
      return;
    }
    if (voleeEnCours.length >= fpv) return;
    setVoleeEnCours((prev) => [...prev, code]);
    setImpactEnCours((prev) => [...prev, impact]);
  };

  const annulerDerniereFleche = () => {
    setSelection(null);
    setVoleeEnCours((prev) => prev.slice(0, -1));
    setImpactEnCours((prev) => prev.slice(0, -1));
  };

  const validerVolee = () => {
    if (voleeEnCours.length !== fpv) return;
    setVolees((prev) => [...prev, voleeEnCours]);
    setImpacts((prev) => [...prev, impactEnCours]);
    setVoleeEnCours([]);
    setImpactEnCours([]);
    setSelection(null);
  };

  const ajouterSerie = () => setNbSeries((n) => n + 1);

  const remplacerFlecheHistorique = (code) => {
    if (editIndex === null || editSelection === null) return;
    const vi = editIndex, fi = editSelection;
    setVolees((prev) => prev.map((v, i) => (i === vi ? v.map((c, j) => (j === fi ? code : c)) : v)));
    setImpacts((prev) => prev.map((imp, i) => (i === vi ? imp.map((p, j) => (j === fi ? null : p)) : imp)));
    setEditSelection(null);
  };

  const supprimerVoleeHistorique = (index) => {
    setVolees((prev) => prev.filter((_, i) => i !== index));
    setImpacts((prev) => prev.filter((_, i) => i !== index));
    setEditIndex(null);
    setEditSelection(null);
  };

  const handleTerminer = async () => {
    if (volees.length === 0) {
      setError(`Complétez au moins une volée de ${fpv} flèches avant de terminer.`);
      return;
    }
    setError("");
    setSaving(true);
    const payload = {
      archer:       `${user.prenom} ${user.nom}`,
      archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
      date,
      distance,
      type,
      lieu:         lieu.trim() || null,
      protocole:    "tir-compte",
      format,
      nbSeries:     reglages.voleesParSerie ? nbSeries : null,
      volees:       volees.map((codes, i) => ({ codes, impacts: impacts[i] ?? [] })),
      volumePaille: 0,
      volumeBlason: 0,
      volumeCompte: resume.fleches,
      score:        resume.total,
      totalFleches: resume.fleches,
      moyenne:      resume.moyenne != null ? parseFloat(resume.moyenne.toFixed(2)) : null,
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
      console.error("[ExerciceTirCompte] erreur Firestore :", err);
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
      console.error("[ExerciceTirCompte] erreur suppression :", err);
      setError("Erreur lors de la suppression. Réessayez.");
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>{enEdition ? "Modifier — Tir compté" : "Tir compté"}</h2>
        <button style={s.annulerBtn} onClick={onAnnuler}>✕ Annuler</button>
      </div>
      <p style={s.resume}>
        {reglages.voleesParSerie
          ? `Épreuve standard : ${nbSeries} séries de ${reglages.voleesParSerie} volées de ${fpv} flèches.`
          : `Tir libre : volées de ${fpv} flèches, à la suite.`}
      </p>

      {autonome && (
        <div className="form-grid-4">
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={s.input} />
          </Field>
          <Field label="Distance">
            <select value={distance} onChange={(e) => setDistance(e.target.value)} style={s.input} disabled={volees.length > 0}>
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

      <div style={s.segRow}>
        <Segmente
          value={format}
          options={[{ value: "standard", label: "Épreuve standard" }, { value: "libre", label: "Libre" }]}
          onChange={setFormat}
          disabled={volees.length > 0}
        />
        <Segmente
          value={modeSaisie}
          options={[{ value: "clavier", label: "Clavier" }, { value: "blason", label: "Blason" }]}
          onChange={setModeSaisie}
        />
      </div>

      <div style={s.compteurBox}>
        <div style={s.positionTexte}>
          {reglages.voleesParSerie
            ? (position.terminee ? "Épreuve terminée" : `Série ${position.serie}/${nbSeries} · Volée ${position.volee}/${reglages.voleesParSerie}`)
            : `Volée ${position.volee}`}
        </div>
        <div style={s.compteurTotal}>
          {volees.length > 0 ? scoreAffiche : "—"}
          {maxAffiche != null && <span style={s.compteurMax}>/{maxAffiche}</span>}
        </div>
        <div style={s.compteurLabel}>
          {resume.fleches} fl.{resume.moyenne != null && ` · moy. ${resume.moyenne.toFixed(2)} · ≈ ${projection} sur ${base}`} · {volees.length} volée{volees.length > 1 ? "s" : ""}
        </div>
      </div>

      {reglages.voleesParSerie && position.terminee && (
        <div style={s.finBandeau}>
          <div style={s.finTitre}>Épreuve terminée : {resume.total} points</div>
          <div style={s.finDetail}>{resume.series.map((se) => `Série ${se.numero} : ${se.total}/${se.max}`).join(" · ")}</div>
          <button type="button" style={s.miniBtn} onClick={ajouterSerie}>+ Série en plus</button>
        </div>
      )}

      {!position.terminee && (
        <div style={s.voleeEnCoursBox}>
          <div style={s.voleeEnCoursHead}>
            <span>Volée en cours — {voleeEnCours.length}/{fpv} flèche{fpv > 1 ? "s" : ""}</span>
            <button style={s.miniBtn} onClick={annulerDerniereFleche} disabled={voleeEnCours.length === 0}>← Annuler la dernière</button>
          </div>

          {voleeEnCours.length > 0 && (
            <div style={s.recap}>
              {voleeEnCours.map((code, i) => {
                const c = couleurZone(code);
                return (
                  <button key={i} type="button"
                    style={{
                      ...s.recapItem, backgroundColor: c.bg, color: c.text,
                      ...(selection === i ? s.recapItemSelection : {}),
                    }}
                    onClick={() => setSelection(selection === i ? null : i)}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}
          {selection !== null && <p style={s.aide}>Touchez la nouvelle valeur pour la flèche n°{selection + 1}.</p>}

          {modeSaisie === "blason" ? (
            <CibleSaisie
              onImpact={saisirCode}
              disabled={saisieDisabled}
              impactsRecents={impactEnCours.filter(Boolean)}
              impactsEstompes={impacts.flat().filter(Boolean)}
            />
          ) : (
            <ZoneButtons onPress={saisirCode} disabled={saisieDisabled} />
          )}

          <button style={s.validerBtn} onClick={validerVolee} disabled={voleeEnCours.length !== fpv}>
            ✓ Valider la volée
          </button>
        </div>
      )}

      {dispersionImpacts && (
        <p style={s.dispersionTexte}>
          Dispersion : {dispersionImpacts.n} impact{dispersionImpacts.n > 1 ? "s" : ""} positionné{dispersionImpacts.n > 1 ? "s" : ""} ·
          {" "}décalage {texteDecalage(dispersionImpacts.centre)} · rayon moyen ≈ {dispersionImpacts.rayonMoyen.toFixed(1)} largeur de zone
        </p>
      )}

      {volees.length > 0 && (
        <div style={s.historique}>
          {resume.series ? resume.series.filter((se) => se.volees.length > 0).map((se) => (
            <div key={se.numero} style={s.serieCard}>
              <div style={s.serieHead}>
                <span style={s.serieNom}>Série {se.numero}</span>
                <span style={s.serieScore}>{se.total}/{se.max}</span>
              </div>
              {se.volees.map((v) => (
                <VoleeHistorique
                  key={v.index} volee={v}
                  ouverte={editIndex === v.index}
                  selection={editIndex === v.index ? editSelection : null}
                  onOuvrir={() => { setEditIndex(v.index); setEditSelection(null); }}
                  onFermer={() => { setEditIndex(null); setEditSelection(null); }}
                  onSelectionner={setEditSelection}
                  onRemplacer={remplacerFlecheHistorique}
                  onSupprimer={supprimerVoleeHistorique}
                />
              ))}
            </div>
          )) : resume.volees.map((v) => (
            <VoleeHistorique
              key={v.index} volee={v}
              ouverte={editIndex === v.index}
              selection={editIndex === v.index ? editSelection : null}
              onOuvrir={() => { setEditIndex(v.index); setEditSelection(null); }}
              onFermer={() => { setEditIndex(null); setEditSelection(null); }}
              onSelectionner={setEditSelection}
              onRemplacer={remplacerFlecheHistorique}
              onSupprimer={supprimerVoleeHistorique}
            />
          ))}
        </div>
      )}

      {volees.length >= 2 && (
        <div style={s.graphBox}>
          <p style={s.graphTitre}>Régularité — moyenne par flèche, volée par volée</p>
          <div style={{ height: 160 }}><Line data={chartData} options={chartOpts} /></div>
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

function Segmente({ value, options, onChange, disabled }) {
  return (
    <div style={s.segmente}>
      {options.map((o) => (
        <button
          key={o.value} type="button"
          style={{ ...s.segBtn, ...(value === o.value ? s.segBtnActif : {}) }}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function VoleeHistorique({ volee, ouverte, selection, onOuvrir, onFermer, onSelectionner, onRemplacer, onSupprimer }) {
  return (
    <div style={s.histoRow}>
      <button type="button" style={s.histoHead} onClick={ouverte ? onFermer : onOuvrir}>
        <span style={s.histoNum}>V{volee.index + 1}</span>
        <span style={s.histoCodes}>
          {volee.codes.map((c, i) => {
            const col = couleurZone(c);
            return <span key={i} style={{ ...s.histoPastille, backgroundColor: col.bg, color: col.text }}>{c}</span>;
          })}
        </span>
        <span style={s.histoTotal}>{volee.total} pts</span>
      </button>
      {ouverte && (
        <div style={s.histoEdit}>
          <div style={s.recap}>
            {volee.codes.map((c, i) => {
              const col = couleurZone(c);
              return (
                <button key={i} type="button"
                  style={{ ...s.recapItem, backgroundColor: col.bg, color: col.text, ...(selection === i ? s.recapItemSelection : {}) }}
                  onClick={() => onSelectionner(selection === i ? null : i)}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p style={s.aide}>{selection != null ? "Touchez la nouvelle valeur." : "Touchez une flèche à corriger."}</p>
          <ZoneButtons onPress={onRemplacer} disabled={selection === null} />
          <BoutonSupprimer onConfirm={() => onSupprimer(volee.index)} label="cette volée" />
        </div>
      )}
    </div>
  );
}

const s = {
  ...exerciceStyles,

  segRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  segmente: {
    display: "inline-flex", gap: "3px", backgroundColor: "var(--surface-raised)",
    borderRadius: "9px", padding: "3px",
  },
  segBtn: {
    background: "none", border: "none", borderRadius: "7px",
    padding: "7px 12px", fontSize: "12px", fontWeight: "600",
    color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
  },
  segBtnActif: { backgroundColor: "var(--surface)", color: PINK, boxShadow: "var(--shadow-card)" },

  positionTexte: { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" },
  compteurMax: { fontFamily: "var(--mono)", fontSize: "18px", fontWeight: "600", color: "var(--text-dim)" },

  recapItemSelection: { outline: `2px solid ${PINK}`, outlineOffset: "1px" },
  aide: { fontSize: "12px", color: "var(--text-dim)", margin: 0 },

  finBandeau: {
    backgroundColor: "var(--good-soft)", border: "1px solid var(--good)", borderRadius: "12px",
    padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start",
  },
  finTitre: { fontFamily: "var(--display)", fontSize: "16px", fontWeight: "600", color: "var(--text)" },
  finDetail: { fontSize: "12px", color: "var(--text-muted)" },

  dispersionTexte: { fontSize: "12px", color: "var(--text-dim)", margin: 0, lineHeight: 1.5 },

  historique: { display: "flex", flexDirection: "column", gap: "10px" },
  serieCard: {
    border: "1px solid var(--border)", borderRadius: "12px", padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: "8px",
  },
  serieHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  serieNom: { fontSize: "12px", fontWeight: "700", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" },
  serieScore: { fontFamily: "var(--mono)", fontSize: "13px", fontWeight: "700", color: PINK },

  histoRow: { display: "flex", flexDirection: "column", gap: "8px" },
  histoHead: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "none", border: "1px solid var(--border-2)", borderRadius: "9px",
    padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  },
  histoNum: { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", flexShrink: 0 },
  histoCodes: { display: "flex", gap: "4px", flexWrap: "wrap", flex: "1 1 auto" },
  histoPastille: {
    fontFamily: "var(--mono)", fontSize: "11px", fontWeight: "700",
    borderRadius: "5px", padding: "2px 6px", border: "1px solid rgba(0,0,0,0.25)",
  },
  histoTotal: { fontFamily: "var(--mono)", fontSize: "13px", fontWeight: "700", color: "var(--text)" },
  histoEdit: {
    display: "flex", flexDirection: "column", gap: "10px",
    backgroundColor: "var(--surface-sub)", borderRadius: "9px", padding: "12px",
  },

  graphBox: { display: "flex", flexDirection: "column", gap: "8px" },
  graphTitre: { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 },
};
