import { useState, useMemo, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useSeances } from "../../hooks/useSeances";

const PRIMARY   = "#FF007A";
const BLUE      = "#3b82f6";
const DISTANCES  = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;

const todayISO = () => new Date().toISOString().split("T")[0];

const todayYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const CURRENT_SAISON = (() => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
})();

const getSaison = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const INIT = {
  date:         todayISO(),
  distance:     "18m",
  type:         "Entraînement",
  lieu:         "",
  volumePaille: "",
  volumeBlason: "",
  volumeCompte: "",
  score:        "",
  commentaire:  "",
};

// ── Composant principal ───────────────────────────────────────────────────────

export default function Saisie() {
  const { user }    = useAuth();
  const { seances } = useSeances();

  const [form,        setForm]        = useState(INIT);
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [error,       setError]       = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [volEntr, setVolEntr] = useState(null);
  const [filterSaison, setFilterSaison] = useState(CURRENT_SAISON);

  // Objectif mensuel pour la jauge
  useEffect(() => {
    if (!user) return;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;
    const unsub = onSnapshot(doc(db, "objectifs", archerId), (snap) => {
      setVolEntr(snap.exists() ? (snap.data().volEntr || 0) : null);
    });
    return () => unsub();
  }, [user]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSuccess(false);
    setError("");
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.date) {
      errs.date = "La date est requise.";
    } else if (form.date > todayISO()) {
      errs.date = "La date ne peut pas être dans le futur.";
    }
    const p = parseInt(form.volumePaille) || 0;
    const b = parseInt(form.volumeBlason)  || 0;
    const c = parseInt(form.volumeCompte)  || 0;
    const sc = parseInt(form.score)        || 0;
    if (p + b + c === 0) {
      errs.volumes = "Veuillez saisir au moins un volume de flèches.";
    }
    if (sc > 0 && c === 0) {
      errs.score = "Un score nécessite un volume de tir compté.";
    }
    if (sc > c * 10 && c > 0) {
      errs.score = `Score trop élevé : maximum possible = ${c * 10} (${c} flèches × 10).`;
    }
    return errs;
  };

  const paille       = parseInt(form.volumePaille) || 0;
  const blason       = parseInt(form.volumeBlason)  || 0;
  const compte       = parseInt(form.volumeCompte)  || 0;
  const score        = parseInt(form.score)          || 0;
  const totalFleches = paille + blason + compte;
  const moyenne      = compte > 0 ? (score / compte).toFixed(2) : null;
  const scoreMoyNorm = compte > 0 ? Math.round((score / compte) * normFactor(form.distance)) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      await addDoc(collection(db, "seances"), {
        archer:       `${user.prenom} ${user.nom}`,
        archerId:     user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
        date:         form.date,
        distance:     form.distance,
        type:         form.type,
        lieu:         form.lieu.trim() || null,
        volumePaille: paille,
        volumeBlason: blason,
        volumeCompte: compte,
        score,
        totalFleches,
        moyenne:      moyenne !== null ? parseFloat(moyenne) : null,
        commentaire:  form.commentaire.trim() || null,
        createdAt:    serverTimestamp(),
      });
      setSuccess(true);
      setForm((prev) => ({ ...INIT, date: prev.date, distance: prev.distance, type: prev.type }));
    } catch (err) {
      console.error("[Saisie] erreur Firestore :", err);
      setError("Erreur lors de l'enregistrement. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  // ── Stats saison ──────────────────────────────────────────────────────────

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return [...set].sort().reverse();
  }, [seances]);

  const currentYM = todayYM();

  const getCompte = (s) => s.compte ?? s.volumeCompte ?? 0;
  const getPaille = (s) => s.paille ?? s.volumePaille ?? 0;
  const getBlason = (s) => s.blason ?? s.volumeBlason ?? 0;

  const currentVolume = useMemo(() =>
    seances
      .filter(s => s.type === "Entraînement" && s.date?.startsWith(currentYM))
      .reduce((sum, s) => sum + getPaille(s) + getBlason(s) + getCompte(s), 0),
    [seances, currentYM]
  );

  const saisonSeances = useMemo(
    () => seances.filter((s) => s.date && getSaison(s.date) === filterSaison),
    [seances, filterSaison]
  );

  const cards = useMemo(() => {
    const scored  = saisonSeances.filter(s => (s.score || 0) > 0 && getCompte(s) > 0);
    const totSc   = scored.reduce((n, s) => n + s.score, 0);
    const totVol  = scored.reduce((n, s) => n + getCompte(s), 0);
    return {
      nbSeances:  saisonSeances.length,
      totFleches: saisonSeances.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0),
      maMoyenne:  totVol > 0 ? (totSc / totVol).toFixed(2) : null,
      lastDate:   saisonSeances[0]?.date ?? null,
    };
  }, [saisonSeances]);

  const { tableRows, tableTotals } = useMemo(() => {
    const rowStats = (list, dist) => {
      const nf     = normFactor(dist);
      const scored = list.filter(s => (s.score || 0) > 0 && getCompte(s) > 0);
      const totSc  = scored.reduce((n, s) => n + s.score, 0);
      const totVol = scored.reduce((n, s) => n + getCompte(s), 0);
      return {
        count:    list.length,
        fleches:  list.reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0),
        moyFl:    totVol > 0 ? (totSc / totVol).toFixed(2) : null,
        scoreMoy: totVol > 0 ? Math.round((totSc / totVol) * nf) : null,
      };
    };
    const rows = DISTANCES.map((dist) => {
      const entr = saisonSeances.filter((s) => s.distance === dist && s.type === "Entraînement");
      const comp = saisonSeances.filter((s) => s.distance === dist && s.type === "Compétition");
      if (!entr.length && !comp.length) return null;
      return { dist, entr: rowStats(entr, dist), comp: rowStats(comp, dist), total: rowStats([...entr, ...comp], dist) };
    }).filter(Boolean);
    const allScored = saisonSeances.filter(s => (s.score || 0) > 0 && getCompte(s) > 0);
    const totSc  = allScored.reduce((n, s) => n + s.score, 0);
    const totVol = allScored.reduce((n, s) => n + getCompte(s), 0);
    const tableTotals = {
      entr: {
        count:   rows.reduce((n, r) => n + r.entr.count, 0),
        fleches: rows.reduce((n, r) => n + r.entr.fleches, 0),
      },
      comp: {
        count:   rows.reduce((n, r) => n + r.comp.count, 0),
        fleches: rows.reduce((n, r) => n + r.comp.fleches, 0),
      },
      total: {
        count:    rows.reduce((n, r) => n + r.total.count, 0),
        fleches:  rows.reduce((n, r) => n + r.total.fleches, 0),
        moyFl:    totVol > 0 ? (totSc / totVol).toFixed(2) : null,
        scoreMoy: null,
      },
    };
    return { tableRows: rows, tableTotals };
  }, [saisonSeances]);

  const pct        = volEntr > 0 ? Math.min(100, Math.round(currentVolume / volEntr * 100)) : 0;
  const gaugeColor = pct >= 100 ? PRIMARY : pct >= 80 ? "#16a34a" : pct >= 50 ? "#f97316" : "#ef4444";

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.outer}>

      {/* ── Formulaire ── */}
      <div style={s.formZone}>
        <h2 style={s.title}>Nouvelle séance</h2>

        <form onSubmit={handleSubmit} style={s.card} className="saisie-form">

          <div className="form-grid-4">
            <Field label="Date" error={fieldErrors.date}>
              <input type="date" value={form.date} onChange={set("date")}
                style={{ ...s.input, ...(fieldErrors.date ? s.inputError : {}) }} required />
            </Field>
            <Field label="Distance">
              <select value={form.distance} onChange={set("distance")} style={s.input}>
                {DISTANCES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Type de séance">
              <select value={form.type} onChange={set("type")} style={s.input}>
                <option>Entraînement</option>
                <option>Compétition</option>
              </select>
            </Field>
            <Field label="Lieu (optionnel)">
              <input type="text" value={form.lieu} onChange={set("lieu")}
                style={s.input} placeholder="ex : Salle Tinténiac" />
            </Field>
          </div>

          <div style={s.divider} />

          <div className="form-grid-4">
            <Field label="Vol. paille" error={fieldErrors.volumes}>
              <input type="number" min="0" value={form.volumePaille}
                onChange={e => { set("volumePaille")(e); setFieldErrors(p => ({ ...p, volumes: undefined })); }}
                style={{ ...s.input, ...(fieldErrors.volumes ? s.inputError : {}) }} placeholder="0" />
            </Field>
            <Field label="Vol. blason">
              <input type="number" min="0" value={form.volumeBlason}
                onChange={e => { set("volumeBlason")(e); setFieldErrors(p => ({ ...p, volumes: undefined })); }}
                style={{ ...s.input, ...(fieldErrors.volumes ? s.inputError : {}) }} placeholder="0" />
            </Field>
            <Field label="Vol. tir compté">
              <input type="number" min="0" value={form.volumeCompte}
                onChange={e => { set("volumeCompte")(e); setFieldErrors(p => ({ ...p, volumes: undefined, score: undefined })); }}
                style={{ ...s.input, ...(fieldErrors.volumes ? s.inputError : {}) }} placeholder="0" />
            </Field>
            <Field label="Score" error={fieldErrors.score}>
              <input type="number" min="0" value={form.score}
                onChange={set("score")}
                style={{ ...s.input, ...(fieldErrors.score ? s.inputError : {}) }} placeholder="0" />
            </Field>
          </div>

          <Field label="Commentaire (optionnel)">
            <input type="text" value={form.commentaire} onChange={set("commentaire")}
              style={s.input} placeholder="Notes, observations…" />
          </Field>

          <div style={s.summary}>
            <SummaryItem label="Total flèches" value={totalFleches || "—"} />
            <div style={s.sep} />
            <SummaryItem
              label="Moyenne / flèche"
              value={moyenne ?? "—"}
              accent={moyenne !== null}
            />
            <div style={s.sep} />
            <SummaryItem
              label="Score moyen"
              value={scoreMoyNorm ?? "—"}
              accent={scoreMoyNorm !== null}
            />
          </div>

          {error   && <div style={s.msgError}>{error}</div>}
          {success && <div style={s.msgSuccess}>✓ Séance enregistrée avec succès !</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...s.btn, ...(loading ? s.btnOff : {}) }}
          >
            {loading ? "Enregistrement…" : "Enregistrer la séance"}
          </button>
        </form>
      </div>

      {/* ── Jauge volume mensuel ── */}
      {volEntr > 0 && (
        <div style={s.gaugeBox}>
          <div style={s.gaugeRow}>
            <span style={s.gaugeLabel}>Volume entraînement ce mois</span>
            <span style={s.gaugeFigures}>
              {currentVolume} / {volEntr} flèches —{" "}
              <strong style={{ color: gaugeColor }}>{pct}%</strong>
            </span>
          </div>
          <div style={s.gaugeTrack}>
            <div style={{ ...s.gaugeBar, width: `${pct}%`, backgroundColor: gaugeColor }} />
          </div>
        </div>
      )}

      {/* ── Tableau détail par distance & type ── */}
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionLabel}>Détail par distance &amp; type</span>
          <select
            value={filterSaison}
            onChange={e => setFilterSaison(e.target.value)}
            style={s.saisonSelect}
          >
            {saisonOptions.map(sn => <option key={sn}>{sn}</option>)}
          </select>
        </div>
        {tableRows.length > 0 ? (
          <>
            {/* ── Vue desktop : tableau ── */}
            <div className="saisie-table-desktop" style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Dist.</th>
                    <th style={{ ...s.thR, ...s.thEntr }}>Séances</th>
                    <th style={{ ...s.thR, ...s.thEntr }}>Flèches</th>
                    <th style={{ ...s.thR, ...s.thEntr }}>Moy./fl.</th>
                    <th style={{ ...s.thR, ...s.thEntrEnd }}>Score moy.</th>
                    <th style={{ ...s.thR, ...s.thComp }}>Séances</th>
                    <th style={{ ...s.thR, ...s.thComp }}>Flèches</th>
                    <th style={{ ...s.thR, ...s.thComp }}>Moy./fl.</th>
                    <th style={{ ...s.thR, ...s.thComp }}>Score moy.</th>
                    <th style={{ ...s.thR, ...s.thTotal }}>Séances</th>
                    <th style={{ ...s.thR, ...s.thTotal }}>Flèches</th>
                    <th style={{ ...s.thR, ...s.thTotal }}>Moy./fl.</th>
                    <th style={{ ...s.thR, ...s.thTotal }}>Score moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.dist} style={s.tr}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1f1f1f"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}
                    >
                      <td style={s.td}><span style={s.badge}>{row.dist}</span></td>
                      <td style={s.tdR}>{row.entr.count || "—"}</td>
                      <td style={s.tdR}>{row.entr.fleches || "—"}</td>
                      <td style={{ ...s.tdR, color: row.entr.moyFl ? PRIMARY : "#bbb", fontWeight: "600" }}>
                        {row.entr.moyFl ?? "—"}
                      </td>
                      <td style={{ ...s.tdR, borderRight: "2px solid #333" }}>
                        {row.entr.scoreMoy ?? "—"}
                      </td>
                      <td style={s.tdR}>{row.comp.count || "—"}</td>
                      <td style={s.tdR}>{row.comp.fleches || "—"}</td>
                      <td style={{ ...s.tdR, color: row.comp.moyFl ? BLUE : "#bbb", fontWeight: "600" }}>
                        {row.comp.moyFl ?? "—"}
                      </td>
                      <td style={s.tdR}>{row.comp.scoreMoy ?? "—"}</td>
                      <td style={{ ...s.tdR, fontWeight: "700", color: "#fff", borderLeft: "2px solid #444" }}>
                        {row.total.count || "—"}
                      </td>
                      <td style={{ ...s.tdR, fontWeight: "700", color: "#fff" }}>
                        {row.total.fleches ? row.total.fleches.toLocaleString("fr-FR") : "—"}
                      </td>
                      <td style={{ ...s.tdR, fontWeight: "700", color: "#fff" }}>
                        {row.total.moyFl ?? "—"}
                      </td>
                      <td style={{ ...s.tdR, fontWeight: "700", color: "#fff" }}>
                        {row.total.scoreMoy ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={s.trTotal}>
                    <td style={{ ...s.td, fontWeight: "700", color: "#e8e8e8" }}>Total</td>
                    <td style={s.tdR}>{tableTotals.entr.count || "—"}</td>
                    <td style={{ ...s.tdR, fontWeight: "700", color: "#e8e8e8" }}>
                      {tableTotals.entr.fleches ? tableTotals.entr.fleches.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td style={s.tdR}>—</td>
                    <td style={{ ...s.tdR, borderRight: "2px solid #333" }}>—</td>
                    <td style={s.tdR}>{tableTotals.comp.count || "—"}</td>
                    <td style={{ ...s.tdR, fontWeight: "700", color: "#e8e8e8" }}>
                      {tableTotals.comp.fleches ? tableTotals.comp.fleches.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td style={s.tdR}>—</td>
                    <td style={s.tdR}>—</td>
                    <td style={{ ...s.tdR, fontWeight: "700", color: "#fff", borderLeft: "2px solid #444" }}>
                      {tableTotals.total.count || "—"}
                    </td>
                    <td style={{ ...s.tdR, fontWeight: "700", color: "#fff" }}>
                      {tableTotals.total.fleches ? tableTotals.total.fleches.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td style={{ ...s.tdR, fontWeight: "700", color: "#fff" }}>
                      {tableTotals.total.moyFl ?? "—"}
                    </td>
                    <td style={s.tdR}>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Vue mobile : cartes par distance ── */}
            <div className="saisie-cards-mobile">
              <div className="sdc-summary">
                <span><strong>{tableTotals.total.count}</strong> séance{tableTotals.total.count > 1 ? "s" : ""}</span>
                <span className="sdc-summary-sep">·</span>
                <span><strong>{tableTotals.total.fleches ? tableTotals.total.fleches.toLocaleString("fr-FR") : 0}</strong> flèches au total</span>
              </div>
              {tableRows.map((row) => (
                <div key={row.dist} className="saisie-dist-card">
                  <div className="sdc-header">
                    <span className="sdc-dist">{row.dist}</span>
                    <span className="sdc-total">
                      {row.total.count} séance{row.total.count > 1 ? "s" : ""} · {row.total.fleches ? row.total.fleches.toLocaleString("fr-FR") : 0} fl.
                    </span>
                  </div>
                  <div className="sdc-body">
                    <div className="sdc-col sdc-entr">
                      <div className="sdc-col-label">Entraînement</div>
                      <StatLine label="Séances"   value={row.entr.count   || "—"} />
                      <StatLine label="Flèches"   value={row.entr.fleches || "—"} />
                      <StatLine label="Moy./fl."  value={row.entr.moyFl   ?? "—"} accent={!!row.entr.moyFl}   color="#FF007A" />
                      <StatLine label="Score moy." value={row.entr.scoreMoy ?? "—"} accent={!!row.entr.scoreMoy} color="#FF007A" />
                    </div>
                    <div className="sdc-divider" />
                    <div className="sdc-col sdc-comp">
                      <div className="sdc-col-label">Compétition</div>
                      <StatLine label="Séances"   value={row.comp.count   || "—"} />
                      <StatLine label="Flèches"   value={row.comp.fleches || "—"} />
                      <StatLine label="Moy./fl."  value={row.comp.moyFl   ?? "—"} accent={!!row.comp.moyFl}   color="#3b82f6" />
                      <StatLine label="Score moy." value={row.comp.scoreMoy ?? "—"} accent={!!row.comp.scoreMoy} color="#3b82f6" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={s.emptyStats}>Aucune séance pour cette saison.</div>
        )}
      </div>

    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Field({ label, children, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label className="field-label" style={s.label}>{label}</label>
      {children}
      {error && <span style={s.fieldError}>{error}</span>}
    </div>
  );
}

function SummaryItem({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "11px", color: "#777", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "26px", fontWeight: "700", color: accent ? PRIMARY : "#ccc" }}>
        {value}
      </div>
    </div>
  );
}

function StatLine({ label, value, accent, color }) {
  return (
    <div className="sdc-stat-line">
      <span className="sdc-stat-label">{label}</span>
      <span className="sdc-stat-value" style={accent ? { color, fontWeight: "700" } : {}}>
        {value}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, ...(accent ? { color: PRIMARY } : {}) }}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  // layout
  outer:    { display: "flex", flexDirection: "column", gap: "24px" },
  formZone: {},

  // form
  title: { fontSize: "20px", fontWeight: "700", color: "#e8e8e8", margin: "0 0 20px" },
  card:  {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    padding: "28px", boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    display: "flex", flexDirection: "column", gap: "18px",
  },
  row4:  { gap: "16px" },
  label: {
    fontSize: "11px", fontWeight: "600", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  input: {
    padding: "10px 12px", border: "1.5px solid #2e2e2e", borderRadius: "8px",
    fontSize: "14px", color: "#e8e8e8", outline: "none",
    fontFamily: "inherit", backgroundColor: "#252525",
    width: "100%", boxSizing: "border-box",
  },
  divider: { height: "1px", backgroundColor: "#2a2a2a" },
  summary: {
    display: "flex", alignItems: "center", justifyContent: "space-around",
    backgroundColor: "#1e1e1e", borderRadius: "10px",
    padding: "20px", border: "1px solid #2a2a2a",
  },
  sep:      { width: "1px", height: "44px", backgroundColor: "#333" },
  msgError: {
    backgroundColor: "rgba(255,0,122,0.1)", border: `1px solid ${PRIMARY}`,
    borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: PRIMARY,
  },
  msgSuccess: {
    backgroundColor: "rgba(22,163,74,0.12)", border: "1px solid #16a34a",
    borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
    color: "#16a34a", fontWeight: "500",
  },
  btn:    {
    padding: "13px", backgroundColor: PRIMARY, color: "#fff",
    border: "none", borderRadius: "8px", fontSize: "15px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnOff:     { opacity: 0.6, cursor: "not-allowed" },
  inputError: { borderColor: "#ef4444" },
  fieldError: { fontSize: "11px", color: "#ef4444", fontWeight: "500" },

  // jauge
  gaugeBox: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px",
  },
  gaugeRow:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
  gaugeLabel:  {
    fontSize: "12px", fontWeight: "700", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  gaugeFigures:{ fontSize: "13px", color: "#bbb" },
  gaugeTrack:  { height: "8px", borderRadius: "4px", backgroundColor: "#2a2a2a", overflow: "hidden" },
  gaugeBar:    { height: "100%", borderRadius: "4px", transition: "width 0.4s ease" },

  // sections communes
  section:     { display: "flex", flexDirection: "column", gap: "12px" },
  sectionHead: { display: "flex", alignItems: "center", gap: "10px" },
  sectionLabel:{
    fontSize: "11px", fontWeight: "700", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  saisonBadge: {
    backgroundColor: "#2a2a2a", borderRadius: "5px",
    padding: "2px 8px", fontSize: "11px", fontWeight: "600", color: "#aaa",
  },
  saisonSelect: {
    padding: "4px 10px", borderRadius: "7px",
    border: "1.5px solid #2e2e2e",
    backgroundColor: "#252525",
    color: "#d0d0d0",
    fontSize: "12px", fontWeight: "600",
    cursor: "pointer", outline: "none",
    fontFamily: "inherit",
  },

  // tableau
  tableWrap: {
    backgroundColor: "#1a1a1a", borderRadius: "12px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.3)", overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
  th: {
    padding: "8px 7px", textAlign: "left",
    fontSize: "10px", fontWeight: "700", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.03em",
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
    backgroundColor: "#1e1e1e",
  },
  thR: {
    padding: "8px 7px", textAlign: "right",
    fontSize: "10px", fontWeight: "700", color: "#777",
    textTransform: "uppercase", letterSpacing: "0.03em",
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
  },
  thEntr:    { color: PRIMARY,   backgroundColor: "rgba(255,0,122,0.1)" },
  thEntrEnd: { color: PRIMARY,   backgroundColor: "rgba(255,0,122,0.1)", borderRight: "2px solid #333" },
  thComp:    { color: BLUE,      backgroundColor: "rgba(59,130,246,0.1)" },
  thTotal:   { color: "#e8e8e8", backgroundColor: "#252525", borderLeft: "2px solid #444" },
  tr:        { borderBottom: "1px solid #1e1e1e", transition: "background-color 0.1s" },
  trTotal:     { borderTop: "2px solid #333", backgroundColor: "#1e1e1e" },
  td:        { padding: "8px 7px", color: "#d0d0d0", whiteSpace: "nowrap" },
  tdR:       { padding: "8px 7px", textAlign: "right", color: "#ccc", whiteSpace: "nowrap" },
  badge: {
    backgroundColor: "#2a2a2a", borderRadius: "5px",
    padding: "2px 8px", fontSize: "12px", fontWeight: "600", color: "#bbb",
  },

  // cartes stats
  statCards: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" },
  statCard:  {
    backgroundColor: "#1a1a1a", borderRadius: "10px",
    boxShadow: "0 1px 8px rgba(0,0,0,0.3)",
    padding: "16px 18px", display: "flex", flexDirection: "column", gap: "4px",
  },
  statLabel: {
    fontSize: "11px", fontWeight: "600", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  statValue: { fontSize: "22px", fontWeight: "700", color: "#e8e8e8", letterSpacing: "-0.01em" },
  statSub:   { fontSize: "11px", color: "#555" },

  emptyStats: {
    backgroundColor: "#1a1a1a", borderRadius: "10px",
    boxShadow: "0 1px 8px rgba(0,0,0,0.3)",
    padding: "32px", textAlign: "center", color: "#555", fontSize: "14px",
  },
};
