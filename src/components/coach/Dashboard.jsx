import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAllSeances } from "../../hooks/useAllSeances";
import { useAuth } from "../../hooks/useAuth";
import { PRIMARY, BLUE, fmtDateLongue, CURRENT_SAISON, cleSeance, nbSeances, couleurJaugeVolume, avancementMois, getPaille, getBlason, getCompte } from "../../utils/seances";
import { regrouperParJour } from "../../utils/journalCoach";
import { commentaireSeanceDe } from "../../utils/exercices";
import { CarteExercice, RetourCoach } from "./DetailJour";
import * as ui from "../archer/styleArcher";

const GREEN  = "var(--ok)";   // vert : activité récente
const RED    = "var(--bad)";
const ORANGE = "var(--warn)";

// Un archer sans séance depuis plus de 2 mois est rangé dans « Inactifs ».
const JOURS_INACTIF = 60;

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

/** onOuvrirJournal({ archer?, ouvrir? }) : ouvre le Journal coach filtré sur un
 *  archer, ou directement sur une séance. */
export default function Dashboard({ onOuvrirJournal }) {
  const { seances, loading, error, updateRetourCoach } = useAllSeances();
  const { user } = useAuth();
  const objectifs = useObjectifs();
  const [ouverte,      setOuverte]      = useState(null);  // archer dont la dernière séance est dépliée
  const [voirInactifs, setVoirInactifs] = useState(false);

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

  // ── Dernière séance de chaque archer (le dernier jour, le dernier exercice tiré) ──
  // Quand l'archer enregistre une nouvelle séance, elle prend la place de l'ancienne.
  const dernieres = useMemo(() => {
    const parArcher = {};
    for (const s of seances) {
      if (!s.date || !s.archer) continue;
      const der = parArcher[s.archer];
      if (!der || s.date > der[0].date) parArcher[s.archer] = [s];
      else if (s.date === der[0].date) der.push(s);
    }
    const res = {};
    for (const [archer, docs] of Object.entries(parArcher)) {
      const lignes = regrouperParJour(docs);
      const instant = (l) => Math.max(...l.docs.map((d) => d.createdAt?.toMillis?.() ?? 0));
      res[archer] = lignes.sort((a, b) => instant(b) - instant(a))[0];
    }
    return res;
  }, [seances]);

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

      {/* ── Dernière séance de chaque archer, à commenter si on le souhaite ── */}
      <Section title="Dernière séance par archer" sous="Touchez une séance pour la voir et y répondre. La suivante prendra sa place.">
        {archerActivity.length === 0 ? (
          <div style={s.calme}>Aucune séance enregistrée.</div>
        ) : (
          <div style={s.liste}>
            {[...actifs, ...(voirInactifs ? inactifs : [])].map((a) => (
              <DerniereSeance
                key={a.name} a={a} ligne={dernieres[a.name]}
                ouverte={ouverte === a.name}
                onBasculer={() => setOuverte(ouverte === a.name ? null : a.name)}
                estMoi={!!user?.id && a.id === user.id}
                onEnregistrerRetour={(ligne, texte) => updateRetourCoach(ligne.docs.map((d) => d.id), texte)}
                onDetail={(ligne) => onOuvrirJournal?.({ ouvrir: ligne.id })}
                onJournal={() => ouvrirArcher(a.name)}
              />
            ))}
            {inactifs.length > 0 && (
              <button type="button" style={s.inactifsTitre} onClick={() => setVoirInactifs((v) => !v)}>
                {voirInactifs ? "▾" : "▸"} Inactifs depuis plus de 2 mois ({inactifs.length})
              </button>
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

// Une ligne par archer : sa dernière séance, repliée. Dépliée, on voit les
// exercices et les commentaires de l'archer, et on peut écrire le retour du coach.
function DerniereSeance({ a, ligne, ouverte, onBasculer, estMoi, onEnregistrerRetour, onDetail, onJournal }) {
  const col   = a.days < 7 ? GREEN : a.days <= 14 ? ORANGE : RED;
  const label = a.days === 0 ? "Auj." : a.days === 1 ? "Hier" : `${a.days} j.`;
  if (!ligne) return null;
  const couleur = ligne.type === "Compétition" ? BLUE : PRIMARY;
  const fleches = ligne.paille + ligne.blason + ligne.compte;
  const extrait = premiereLigne(ligne.commentaire);
  const commentairesSeance = [...new Set(ligne.docs.map(commentaireSeanceDe).filter(Boolean))];

  return (
    <div style={{ ...s.derniere, ...(ouverte ? s.derniereOuverte : {}) }}>
      <button type="button" style={s.ligneBtn} onClick={onBasculer} aria-expanded={ouverte}>
        <span style={s.ligneTexte}>
          <span style={s.ligneNom}>
            {a.name}
            {!estMoi && ligne.retourCoach && <span style={s.repondu}>✓ Retour envoyé</span>}
            {!estMoi && !ligne.retourCoach && ligne.commentaire && <span style={s.attente}>Commentaire de l'archer</span>}
          </span>
          <span style={s.ligneMeta}>
            <span style={ui.point(couleur)} />
            {fmtDateLongue(ligne.date)} · {ligne.distance}{fleches > 0 ? ` · ${fleches} fl.` : ""}
          </span>
          {!ouverte && extrait && <span style={s.ligneExtrait}>« {extrait} »</span>}
        </span>
        <span style={{ ...s.lastRight, color: col }}>{label}</span>
      </button>

      {ouverte && (
        <div style={s.depli}>
          {commentairesSeance.map((c, i) => <p key={i} style={s.commentaire}>« {c} »</p>)}
          {ligne.docs.map((d) => <CarteExercice key={d.id} doc={d} compact />)}
          {!estMoi && (
            <RetourCoach
              key={ligne.id}
              initial={ligne.retourCoach}
              onEnregistrer={(texte) => onEnregistrerRetour(ligne, texte)}
            />
          )}
          <div style={s.liens}>
            <button type="button" style={ui.boutonSecondaire} onClick={() => onDetail(ligne)}>Séance en détail →</button>
            <button type="button" style={ui.boutonSecondaire} onClick={onJournal}>Journal de {a.name.split(" ")[0]} →</button>
          </div>
        </div>
      )}
    </div>
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
    backgroundColor: "transparent", border: "none",
    cursor: "pointer", fontFamily: "inherit", color: "inherit",
  },
  ligneTexte:   { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 },
  ligneNom:     { fontSize: "14px", fontWeight: "600", color: "var(--text)" },
  ligneMeta:    { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-muted)" },
  ligneExtrait: { fontSize: "13px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "560px" },
  lastRight:    { fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap" },

  inactifsTitre: {
    padding: "11px 18px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", textAlign: "left",
    backgroundColor: "transparent", border: "none", fontFamily: "inherit",
  },

  // dernière séance par archer (dépliable)
  derniere:        { borderBottom: "1px solid var(--border)" },
  derniereOuverte: { backgroundColor: "var(--surface-sub)" },
  repondu:  { marginLeft: "10px", fontSize: "12px", fontWeight: "600", color: "var(--ok)" },
  attente:  { marginLeft: "10px", fontSize: "12px", fontWeight: "600", color: PRIMARY },
  depli:    { display: "flex", flexDirection: "column", gap: "10px", padding: "0 18px 16px" },
  commentaire: { fontSize: "14px", color: "var(--text-2)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-line" },
  liens:    { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" },

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
