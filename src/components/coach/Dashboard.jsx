import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAllSeances } from "../../hooks/useAllSeances";
import { useAuth } from "../../hooks/useAuth";
import { PRIMARY, BLUE, fmtDateCourte, fmtDateLongue, CURRENT_SAISON, cleSeance, nbSeances, couleurJaugeVolume, avancementMois, getPaille, getBlason, getCompte } from "../../utils/seances";
import { regrouperParJour, aCommenter, JOURS_A_COMMENTER } from "../../utils/journalCoach";
import * as ui from "../archer/styleArcher";

const GREEN  = "var(--ok)";   // vert : activité récente
const RED    = "var(--bad)";
const ORANGE = "var(--warn)";

// Un archer sans séance depuis plus de 2 mois est rangé dans « Inactifs ».
const JOURS_INACTIF = 60;
// Commentaires sans réponse affichés sur le tableau de bord (la suite dans le Journal).
const NB_A_COMMENTER = 6;

// ── helpers ───────────────────────────────────────────────────────────────────

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function getWeekBounds() {
  const today = new Date();
  const dow   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  const sun   = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [isoLocal(mon), isoLocal(sun)];
}

const moisCourant = () => isoLocal(new Date()).slice(0, 7);

function daysSince(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - new Date(iso + "T00:00:00")) / 86400000);
}

const sumFleches = (s) => s.totalFleches ?? getPaille(s) + getBlason(s) + getCompte(s);
const premiereLigne = (txt) => (txt ?? "").split("\n")[0].replace(/^Séance – /, "");

// ── objectifs hook ────────────────────────────────────────────────────────────

function useObjectifs() {
  const [objectifs, setObjectifs] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "objectifs"), (snap) =>
      setObjectifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return objectifs;
}

// ── composant principal ───────────────────────────────────────────────────────

/** onOuvrirJournal({ archer?, filtre?, ouvrir? }) : ouvre le Journal coach filtré
 *  sur un archer, sur les commentaires sans réponse, ou directement sur une séance. */
export default function Dashboard({ onOuvrirJournal }) {
  const { seances, loading, error } = useAllSeances();
  const { user } = useAuth();
  const objectifs = useObjectifs();

  const [monStr, sunStr] = useMemo(() => getWeekBounds(), []);
  const ym = useMemo(() => moisCourant(), []);

  const weekSeances  = useMemo(() => seances.filter(s => s.date >= monStr && s.date <= sunStr), [seances, monStr, sunStr]);
  const monthSeances = useMemo(() => seances.filter(s => s.date?.startsWith(ym)), [seances, ym]);

  const fleches = useMemo(() => monthSeances.reduce((n, s) => n + sumFleches(s), 0), [monthSeances]);

  const archerDuMois = useMemo(() => {
    const c = {};
    for (const s of monthSeances) {
      if (!s.archer) continue;
      if (!c[s.archer]) c[s.archer] = { name: s.archer, seances: new Set() };
      c[s.archer].seances.add(cleSeance(s));
    }
    return Object.values(c).map((a) => ({ name: a.name, n: a.seances.size })).sort((a, b) => b.n - a.n)[0] ?? null;
  }, [monthSeances]);

  // ── Commentaires des archers sans réponse (les plus récents d'abord) ─────
  const recentes = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - JOURS_A_COMMENTER);
    return seances.filter((s) => s.date >= isoLocal(limite));
  }, [seances]);
  const aCommenterListe = useMemo(
    () => regrouperParJour(recentes)
      .filter((l) => aCommenter(l, user?.id))
      .sort((a, b) => b.date.localeCompare(a.date) || (a.archer ?? "").localeCompare(b.archer ?? "")),
    [recentes, user?.id]
  );

  // ── tous les archers, triés par dernière séance décroissante ──────────────
  // Clé = s.archer (nom complet) — toujours défini, robuste même si archerId varie
  const archerActivity = useMemo(() => {
    const map = {};
    for (const s of seances) {
      if (!s.date || !s.archer) continue;
      if (!map[s.archer]) {
        map[s.archer] = { id: s.archerId, name: s.archer, lastDate: s.date };
      } else {
        if (s.date > map[s.archer].lastDate) map[s.archer].lastDate = s.date;
        if (!map[s.archer].id && s.archerId) map[s.archer].id = s.archerId;
      }
    }
    return Object.values(map)
      .map((a) => ({ ...a, days: daysSince(a.lastDate) }))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [seances]);
  const actifs   = archerActivity.filter((a) => a.days <= JOURS_INACTIF);
  const inactifs = archerActivity.filter((a) => a.days > JOURS_INACTIF);

  // ── volume entraînement vs objectif ──────────────────────────────────────
  const volumeData = useMemo(() => {
    return archerActivity.map(archer => {
      const obj = objectifs.find(o => o.archer === archer.name || o.id === archer.id);
      const vol = monthSeances
        .filter(s => s.archer === archer.name && s.type?.startsWith("Entraîn"))
        .reduce((n, s) => n + getPaille(s) + getBlason(s) + getCompte(s), 0);
      const target = obj?.saisons?.[CURRENT_SAISON]?.volEntr ?? obj?.volEntr ?? 0;
      const hasObj = !!obj && target > 0;
      const rawPct = hasObj ? Math.round((vol / target) * 100) : null;
      return { ...archer, vol, target, hasObj, rawPct, barPct: hasObj ? Math.min(rawPct, 100) : null };
    })
      // Un archer inactif sans objectif n'a rien à montrer ici.
      .filter((a) => a.hasObj || a.days <= JOURS_INACTIF)
      .sort((a, b) => {
        if (a.hasObj !== b.hasObj) return a.hasObj ? -1 : 1;
        return (b.rawPct ?? 0) - (a.rawPct ?? 0);
      });
  }, [archerActivity, monthSeances, objectifs]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={ui.info}>Chargement…</div>;
  if (error)   return <div style={ui.erreur}>{error}</div>;

  const ouvrirArcher = (name) => onOuvrirJournal?.({ archer: name });

  return (
    <div style={{ ...ui.page, gap: "24px" }}>

      <div className="coach-cards-grid">
        <Kpi label="Séances cette semaine" value={nbSeances(weekSeances)} />
        <Kpi label="Séances ce mois"       value={nbSeances(monthSeances)} />
        <Kpi label="Flèches ce mois"       value={fleches.toLocaleString("fr-FR")} />
        <Kpi
          label="Archer du mois"
          value={archerDuMois ? archerDuMois.name.split(" ")[0] : "—"}
          sub={archerDuMois ? `${archerDuMois.n} séance${archerDuMois.n > 1 ? "s" : ""}` : undefined}
        />
      </div>

      {/* ── Commentaires des archers sans réponse ── */}
      <Section
        title="Commentaires des archers"
        sous={aCommenterListe.length > 0
          ? `${aCommenterListe.length} commentaire${aCommenterListe.length > 1 ? "s" : ""} des ${JOURS_A_COMMENTER} derniers jours sans réponse`
          : null}
        action={aCommenterListe.length > NB_A_COMMENTER && (
          <button type="button" style={ui.boutonSecondaire} onClick={() => onOuvrirJournal?.({ filtre: "aCommenter" })}>
            Tout voir ({aCommenterListe.length})
          </button>
        )}
      >
        {aCommenterListe.length === 0 ? (
          <div style={s.calme}>Aucun commentaire d'archer sans réponse ces {JOURS_A_COMMENTER} derniers jours.</div>
        ) : (
          <div style={s.liste}>
            {aCommenterListe.slice(0, NB_A_COMMENTER).map((l) => {
              const couleur = l.type === "Compétition" ? BLUE : PRIMARY;
              const extrait = premiereLigne(l.commentaire);
              return (
                <button key={l.id} type="button" style={s.ligneBtn} onClick={() => onOuvrirJournal?.({ ouvrir: l.id, filtre: "aCommenter" })}>
                  <span style={s.ligneTexte}>
                    <span style={s.ligneNom}>{l.archer}</span>
                    <span style={s.ligneMeta}>
                      <span style={ui.point(couleur)} />
                      {fmtDateLongue(l.date)} · {l.distance}
                    </span>
                    {extrait && <span style={s.ligneExtrait}>« {extrait} »</span>}
                  </span>
                  <span style={s.ligneAction}>Répondre →</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Dernière séance par archer ── */}
      <Section title="Dernière séance par archer" sous="Touchez un nom pour ouvrir son journal">
        {archerActivity.length === 0 ? (
          <div style={s.calme}>Aucune séance enregistrée.</div>
        ) : (
          <div style={s.liste}>
            {actifs.map((a) => <LigneActivite key={a.name} a={a} onClick={() => ouvrirArcher(a.name)} />)}
            {inactifs.length > 0 && (
              <details style={s.inactifs}>
                <summary style={s.inactifsTitre}>Inactifs depuis plus de 2 mois ({inactifs.length})</summary>
                {inactifs.map((a) => <LigneActivite key={a.name} a={a} onClick={() => ouvrirArcher(a.name)} />)}
              </details>
            )}
          </div>
        )}
      </Section>

      {/* ── Volume vs objectif ── */}
      <Section title="Volume d'entraînement du mois" sous="Par rapport à l'objectif mensuel de chacun">
        {volumeData.length === 0 ? (
          <div style={s.calme}>Aucune séance enregistrée.</div>
        ) : (
          <div style={s.liste}>
            {volumeData.map((a) => (
              <button key={a.name} type="button" style={s.volRow} onClick={() => ouvrirArcher(a.name)}>
                <span style={s.volMeta}>
                  <span style={s.volName}>{a.name}</span>
                  {a.hasObj ? (
                    <span style={s.volText}>{a.vol} / {a.target} fl. ({a.rawPct} %)</span>
                  ) : (
                    <span style={s.volNoObj}>{a.vol} fl. · pas d'objectif</span>
                  )}
                </span>
                {a.hasObj && (
                  <span style={s.barTrack}>
                    <span style={{ ...s.barFill, width: `${a.barPct}%`, backgroundColor: couleurJaugeVolume(a.rawPct, avancementMois()) }} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── sous-composants ───────────────────────────────────────────────────────────

function Kpi({ label, value, sub }) {
  return (
    <div style={ui.kpi}>
      <div style={ui.kpiLabel}>{label}</div>
      <div style={ui.kpiValeur}>{value}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  );
}

function Section({ title, sous, action, children }) {
  return (
    <section style={s.section}>
      <div style={ui.barre}>
        <div>
          <h3 style={ui.titreSection}>{title}</h3>
          {sous && <p style={{ ...ui.sousTitre, marginTop: "2px" }}>{sous}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LigneActivite({ a, onClick }) {
  const col   = a.days < 7 ? GREEN : a.days <= 14 ? ORANGE : RED;
  const label = a.days === 0 ? "Auj." : `${a.days} j.`;
  return (
    <button type="button" style={s.ligneBtn} onClick={onClick}>
      <span style={s.ligneNom}>{a.name}</span>
      <span style={{ ...s.lastRight, color: col }}>{label} · {fmtDateCourte(a.lastDate)}</span>
    </button>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = {
  kpiSub: { fontSize: "12px", color: "var(--text-dim)" },

  section: { display: "flex", flexDirection: "column", gap: "10px" },
  calme:   { ...ui.carte, padding: "18px 20px", color: "var(--text-muted)", fontSize: "14px" },

  // Liste en carte : une ligne cliquable par élément.
  liste: { ...ui.carte, overflow: "hidden", display: "flex", flexDirection: "column" },
  ligneBtn: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
    width: "100%", padding: "12px 18px", textAlign: "left",
    backgroundColor: "transparent", border: "none", borderBottom: "1px solid var(--border)",
    cursor: "pointer", fontFamily: "inherit", color: "inherit",
  },
  ligneTexte:   { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 },
  ligneNom:     { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  ligneMeta:    { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-muted)" },
  ligneExtrait: { fontSize: "13px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "560px" },
  ligneAction:  { fontSize: "13px", fontWeight: "600", color: PRIMARY, whiteSpace: "nowrap" },
  lastRight:    { fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" },

  inactifs:      { borderTop: "none" },
  inactifsTitre: { padding: "11px 18px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", borderBottom: "1px solid var(--border)" },

  // volume vs objectif
  volRow: {
    display: "flex", flexDirection: "column", gap: "8px", width: "100%", padding: "12px 18px",
    backgroundColor: "transparent", border: "none", borderBottom: "1px solid var(--border)",
    cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit",
  },
  volMeta:  { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" },
  volName:  { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  volText:  { fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap" },
  volNoObj: { fontSize: "13px", color: "var(--text-dim)", whiteSpace: "nowrap" },
  barTrack: { display: "block", height: "7px", backgroundColor: "var(--border)", borderRadius: "10px", overflow: "hidden" },
  barFill:  { display: "block", height: "100%", borderRadius: "10px", transition: "width 0.5s ease" },
};
