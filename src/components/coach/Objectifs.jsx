import { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAllSeances } from "../../hooks/useAllSeances";
import { PRIMARY, CURRENT_SAISON, getSaison, libelleSaison } from "../../utils/seances";
import { niveauEpreuves } from "../../utils/records";
import FilterSelect from "../shared/FilterSelect";
import * as ui from "../archer/styleArcher";

const DIST_LIST = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];
// Un archer sans séance depuis plus de 2 mois est rangé dans « Inactifs ».
const JOURS_INACTIF = 60;

// Lit les objectifs d'un archer pour une saison donnée (rétrocompat ancien format)
function getObjForSaison(raw, saison) {
  if (!raw) return null;
  if (raw.saisons?.[saison]) return raw.saisons[saison];
  // Ancien format : distances + volEntr à la racine
  if (raw.distances || raw.volEntr) return { distances: raw.distances ?? {}, volEntr: raw.volEntr ?? 0 };
  return null;
}

// ── hook : lecture + écriture objectifs ───────────────────────────────────────

function useObjectifsManager() {
  const [objectifs, setObjectifs] = useState({});
  const [loaded,    setLoaded]    = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "objectifs"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setObjectifs(map);
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  // `distancesMasquees` : distances retirées de la carte par le coach (pour toutes les
  // saisons), même si l'archer y a déjà tiré.
  const saveObjectif = async (archerId, archerName, saison, distances, volEntr, distancesMasquees) => {
    const cleanDist = {};
    for (const [dist, val] of Object.entries(distances)) {
      const n = parseInt(val, 10);
      if (n > 0) cleanDist[dist] = n;
    }
    const existing = objectifs[archerId] ?? {};
    const saisons  = { ...(existing.saisons ?? {}) };
    saisons[saison] = { distances: cleanDist, volEntr: parseInt(volEntr, 10) || 0 };

    await setDoc(doc(db, "objectifs", archerId), {
      archer:   archerName,
      archerId,
      saisons,
      distancesMasquees,
    }, { merge: true });
  };

  return { objectifs, loaded, saveObjectif };
}

// ── carte par archer ──────────────────────────────────────────────────────────

// Une ligne par distance : celles que l'archer tire (d'après ses séances) et celles
// qui ont déjà un objectif ; les autres s'ajoutent avec « + Distance ».
function ArcherCard({ archer, objectif, masqueesInit, seances, saison, onSave }) {
  const initiales = Object.fromEntries(DIST_LIST.map((d) => [d, String(objectif?.distances?.[d] ?? "")]));
  const [distances, setDistances] = useState(initiales);
  const [volEntr,  setVolEntr]  = useState(String(objectif?.volEntr ?? ""));
  const [ajoutees, setAjoutees] = useState([]);
  const [masquees, setMasquees] = useState(masqueesInit);
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState(null);

  const tirees = useMemo(() => new Set(seances.map((s) => s.distance)), [seances]);
  const affichees = DIST_LIST.filter((d) => ajoutees.includes(d) || (!masquees.includes(d) && (tirees.has(d) || initiales[d])));
  const autres = DIST_LIST.filter((d) => !affichees.includes(d));

  const modifie = DIST_LIST.some((d) => distances[d] !== initiales[d]) || volEntr !== String(objectif?.volEntr ?? "")
    || [...masquees].sort().join() !== [...masqueesInit].sort().join();

  // Retirer une distance de la carte : sa cible est effacée, et elle ne revient
  // plus d'elle-même (on peut toujours la rajouter avec « + Distance »).
  const retirer = (d) => {
    setDistances((prev) => ({ ...prev, [d]: "" }));
    setAjoutees((a) => a.filter((x) => x !== d));
    setMasquees((m) => (m.includes(d) ? m : [...m, d]));
  };
  const ajouter = (d) => {
    setAjoutees((a) => [...a, d]);
    setMasquees((m) => m.filter((x) => x !== d));
  };
  const hasDef = DIST_LIST.some((d) => distances[d]) || volEntr;

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await onSave(distances, volEntr, masquees);
      setFeedback("ok");
    } catch {
      setFeedback("err");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  // Niveau actuel de l'archer à chaque distance qui a un score cible : même calcul
  // que dans sa Progression (3 meilleures épreuves complètes de la saison).
  const niveau = (d, type) => {
    const cible = parseInt(distances[d], 10);
    if (!(cible > 0)) return null;
    const v = niveauEpreuves(seances, { distance: d, type, saison });
    return v == null ? { v: null } : { v, ecart: v - cible };
  };

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.archerName}>{archer.name}</span>
        {hasDef && <span style={s.defini}><span style={ui.point("var(--good)")} /> Objectif défini</span>}
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>Score cible par distance</div>
        {affichees.length === 0 && <div style={s.vide}>Aucune distance tirée pour l'instant.</div>}
        {affichees.map((d) => (
          <div key={d} style={s.distRow}>
            <span style={s.distLabel}>{d}</span>
            <input
              type="number" min="0" step="1" value={distances[d]} placeholder="—" style={s.input}
              onChange={(e) => setDistances((prev) => ({ ...prev, [d]: e.target.value }))}
              aria-label={`Score cible ${d}`}
            />
            {parseInt(distances[d], 10) > 0 && (
              <span style={s.niveaux} title="Niveau actuel : moyenne des 3 meilleures épreuves complètes de la saison">
                <Niveau label="Comp." n={niveau(d, "Compétition")} />
                <Niveau label="Entr." n={niveau(d, "Entraînement")} />
              </span>
            )}
            <button type="button" style={s.retirer} onClick={() => retirer(d)}
              title={`Retirer le ${d} de la carte`} aria-label={`Retirer le ${d} de la carte`}>✕</button>
          </div>
        ))}
        {autres.length > 0 && (
          <select
            value="" onChange={(e) => e.target.value && ajouter(e.target.value)}
            style={s.ajout} aria-label="Ajouter une distance"
          >
            <option value="">+ Distance</option>
            {autres.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>Volume mensuel d'entraînement (flèches)</div>
        <input
          type="number" min="0" step="10" value={volEntr} placeholder="ex : 300"
          onChange={(e) => setVolEntr(e.target.value)}
          style={{ ...s.input, width: "110px" }}
          aria-label="Volume mensuel d'entraînement (flèches)"
        />
      </div>

      <div style={s.cardFooter}>
        <div style={s.feedbackArea}>
          {feedback === "ok"  && <span style={s.feedOk}>✓ Enregistré</span>}
          {feedback === "err" && <span style={s.feedErr}>Échec de l'enregistrement</span>}
        </div>
        <button
          style={{ ...s.btn, ...(saving || !modifie ? s.btnOff : {}) }}
          onClick={handleSave}
          disabled={saving || !modifie}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function Niveau({ label, n }) {
  return (
    <span style={s.niveau}>
      <span style={s.niveauLabel}>{label}</span>
      {n?.v != null ? (
        <>
          <span style={s.niveauValeur}>{n.v}</span>
          <span style={{ ...s.niveauEcart, color: n.ecart >= 0 ? "var(--ok)" : "var(--bad)" }}>
            {n.ecart >= 0 ? `+${n.ecart}` : n.ecart}
          </span>
        </>
      ) : <span style={s.niveauVide}>—</span>}
    </span>
  );
}

// ── page principale ───────────────────────────────────────────────────────────

export default function Objectifs() {
  const { seances, loading: loadingSeances } = useAllSeances();
  const { objectifs, loaded, saveObjectif }  = useObjectifsManager();
  const [saison, setSaison] = useState(CURRENT_SAISON);

  const saisonOptions = useMemo(() => {
    const set = new Set(seances.filter(s => s.date).map(s => getSaison(s.date)));
    set.add(CURRENT_SAISON);
    return [...set].sort().reverse();
  }, [seances]);

  const archers = useMemo(() => {
    const map = {};
    for (const s of seances) {
      if (!s.archer || !s.date) continue;
      if (!map[s.archer]) map[s.archer] = { id: s.archerId, name: s.archer, derniere: s.date };
      else {
        if (!map[s.archer].id && s.archerId) map[s.archer].id = s.archerId;
        if (s.date > map[s.archer].derniere) map[s.archer].derniere = s.date;
      }
    }
    const limite = new Date();
    limite.setDate(limite.getDate() - JOURS_INACTIF);
    const iso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
    return Object.values(map)
      .map((a) => ({ ...a, inactif: a.derniere < iso }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [seances]);

  const rawDe = (a) => objectifs[a.id]
    ?? objectifs[a.name.trim().toLowerCase().replace(/\s+/g, "_")]
    ?? Object.values(objectifs).find(o => o.archer === a.name);

  const loading = loadingSeances || !loaded;
  const defCount = archers.filter((a) => !!getObjForSaison(rawDe(a), saison)).length;

  if (loading) return <div style={ui.info}>Chargement…</div>;

  const carte = (a) => (
    <ArcherCard
      key={a.name + saison}
      archer={a}
      objectif={getObjForSaison(rawDe(a), saison)}
      masqueesInit={rawDe(a)?.distancesMasquees ?? []}
      seances={seances.filter((x) => x.archer === a.name || (a.id && x.archerId === a.id))}
      saison={saison}
      onSave={(distances, volEntr, masquees) => {
        const safeId = a.id ?? a.name.trim().toLowerCase().replace(/\s+/g, "_");
        return saveObjectif(safeId, a.name, saison, distances, volEntr, masquees);
      }}
    />
  );
  const actifs   = archers.filter((a) => !a.inactif);
  const inactifs = archers.filter((a) => a.inactif);

  return (
    <div style={{ ...ui.pageLarge, gap: "18px" }}>
      <div style={ui.barre}>
        <div>
          <h3 style={ui.titreSection}>Objectifs des archers</h3>
          <p style={{ ...ui.sousTitre, marginTop: "2px" }}>
            {defCount} sur {archers.length} définis pour la saison {libelleSaison(saison)} · à côté de chaque score cible, le niveau
            actuel (moyenne des 3 meilleures épreuves complètes) et l'écart
          </p>
        </div>
        <FilterSelect label="Saison" value={saison} options={saisonOptions} onChange={setSaison} libelle={libelleSaison} />
      </div>

      {archers.length === 0 ? (
        <div style={ui.vide}>Aucun archer trouvé dans les séances.</div>
      ) : (
        <>
          <div style={s.grid}>{actifs.map(carte)}</div>
          {inactifs.length > 0 && (
            <details style={s.inactifs}>
              <summary style={s.inactifsTitre}>Inactifs depuis plus de 2 mois ({inactifs.length})</summary>
              <div style={{ ...s.grid, marginTop: "12px" }}>{inactifs.map(carte)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", alignItems: "start" },
  inactifs:      {},
  inactifsTitre: { fontSize: "13px", color: "var(--text-muted)", cursor: "pointer" },

  // card
  card: { ...ui.carte, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "16px" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  archerName: { fontSize: "15px", fontWeight: "700", color: "var(--text)" },
  defini:     { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" },

  // sections
  section:      { display: "flex", flexDirection: "column", gap: "8px" },
  sectionLabel: { fontSize: "13px", fontWeight: "600", color: "var(--text-muted)" },
  vide:         { fontSize: "13px", color: "var(--text-dim)" },

  distRow:   { display: "flex", alignItems: "center", gap: "8px 12px", flexWrap: "wrap" },
  distLabel: { fontSize: "13px", fontWeight: "600", color: "var(--text-2)", width: "34px", flexShrink: 0 },
  ajout: {
    alignSelf: "flex-start", padding: "5px 8px", border: "1px dashed var(--border-3)", borderRadius: "7px",
    fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", backgroundColor: "transparent",
    fontFamily: "inherit", cursor: "pointer",
  },

  retirer: {
    marginLeft: "auto", backgroundColor: "transparent", border: "none", color: "var(--text-dim)",
    fontSize: "13px", cursor: "pointer", fontFamily: "inherit", padding: "4px 6px",
  },
  niveaux:      { display: "inline-flex", alignItems: "baseline", gap: "12px" },
  niveau:       { display: "inline-flex", alignItems: "baseline", gap: "4px" },
  niveauLabel:  { fontSize: "12px", color: "var(--text-dim)" },
  niveauValeur: { fontSize: "13px", fontWeight: "700", color: "var(--text)" },
  niveauEcart:  { fontSize: "12px", fontWeight: "700" },
  niveauVide:   { fontSize: "13px", color: "var(--text-dim)" },

  input: {
    padding: "6px 8px", border: "1.5px solid var(--border-2)", borderRadius: "6px",
    fontSize: "13px", color: "var(--text)", fontFamily: "inherit",
    outline: "none", width: "70px", backgroundColor: "var(--input-bg)",
    transition: "border-color 0.15s",
  },

  cardFooter: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
    paddingTop: "12px", borderTop: "1px solid var(--border)",
  },
  feedbackArea: { minHeight: "20px" },
  feedOk:  { fontSize: "12px", color: "var(--ok)", fontWeight: "600" },
  feedErr: { fontSize: "12px", color: "var(--bad)", fontWeight: "600" },
  btn: {
    backgroundColor: PRIMARY, color: "#fff", border: "none", borderRadius: "7px",
    padding: "8px 16px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  btnOff: { opacity: 0.4, cursor: "default" },
};
