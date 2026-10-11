export const PRIMARY = "#FF007A";
export const BLUE    = "#3b82f6";

export const getPaille = s => s.paille ?? s.volumePaille ?? 0;
export const getBlason = s => s.blason ?? s.volumeBlason ?? 0;
export const getCompte = s => s.compte ?? s.volumeCompte ?? 0;

export const normFactor = (dist) => (dist === "5m" || dist === "18m") ? 60 : 72;

export const getSaison = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

// Une séance peut contenir plusieurs exercices (un doc Firestore chacun, même
// `seanceId`) : on compte les séances, pas les exercices. Une séance sans
// `seanceId` (saisie manuelle, ancienne séance) compte pour une.
export const cleSeance = (s) => s.seanceId ?? s.id;
export const nbSeances = (docs) => new Set(docs.map(cleSeance)).size;

// Ordre de tir des exercices d'une séance : heure d'enregistrement (`createdAt`).
// Les séances sont lues avec serverTimestamps « estimate » : un exercice enregistré
// hors ligne a déjà une heure, avant même la confirmation du serveur.
const instant = (d) => d.createdAt?.toMillis?.() ?? 0;
export const parOrdreDeTir = (a, b) => instant(a) - instant(b);

/** Avancement du mois (0–100) : part des jours écoulés, aujourd'hui compris. */
export const avancementMois = (d = new Date()) => {
  const joursDansLeMois = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Math.round((d.getDate() / joursDansLeMois) * 100);
};

// Couleur d'une jauge de volume mensuel (Accueil de l'archer et tableau de bord
// coach), selon le rythme : être à 43 % le 11 du mois, c'est être en avance.
// Rose = objectif atteint ; vert = dans le rythme (au moins l'avancement du mois) ;
// orange = un peu en retard (au moins 80 % du rythme) ; rouge = en retard.
export const couleurJaugeVolume = (pct, rythme = 100) =>
  pct >= 100 ? PRIMARY : pct >= rythme ? "var(--ok)" : pct >= rythme * 0.8 ? "var(--warn)" : "var(--bad)";

// Retour du coach pas encore lu par l'archer. Seuls les retours écrits depuis la
// notification portent `retourCoachLu: false` ; les plus anciens comptent comme lus.
export const retourNonLu = (s) => !!s.retourCoach && s.retourCoachLu === false;

/** Séances (une entrée par séance, la plus récente d'abord) qui ont un retour du coach non lu. */
export function retoursNonLus(docs) {
  const map = new Map();
  for (const d of docs) {
    if (retourNonLu(d) && !map.has(cleSeance(d))) {
      map.set(cleSeance(d), { cle: cleSeance(d), date: d.date, distance: d.distance, type: d.type, texte: d.retourCoach });
    }
  }
  return [...map.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// Date du jour (AAAA-MM-JJ) à l'heure locale. Surtout pas toISOString(), qui
// donne l'heure UTC : entre minuit et 2 h en France, ce serait encore la veille.
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const CURRENT_SAISON = (() => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
})();

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Midi local : évite tout décalage de jour lié au fuseau horaire.
const enDate = (iso) => new Date(`${iso}T12:00:00`);

/** « Samedi 10 octobre » (« Samedi 10 octobre 2026 » avec l'année). */
export const fmtDateLongue = (iso, avecAnnee = false) => {
  if (!iso) return "—";
  const texte = enDate(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", ...(avecAnnee ? { year: "numeric" } : {}),
  });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

/** « 10 oct. 2026 » : date compacte pour les tableaux et les listes. */
export const fmtDateCourte = (iso) =>
  iso ? enDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** { semaine: "sam.", num: 10 } pour une pastille de date. */
export const jourDate = (iso) => {
  const d = enDate(iso);
  return { semaine: d.toLocaleDateString("fr-FR", { weekday: "short" }), num: d.getDate() };
};

export const MOIS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

export const fmtYM = (ym) => {
  if (!ym || ym === "0000-00") return "Date inconnue";
  const [y, m] = ym.split("-");
  return `${MOIS[parseInt(m, 10) - 1]} ${y}`;
};

export const buildMonthTotals = (group) => {
  const tp     = group.reduce((n, x) => n + getPaille(x), 0);
  const tb     = group.reduce((n, x) => n + getBlason(x), 0);
  const scored = group.filter(x => getCompte(x) > 0 && (x.score ?? 0) > 0);
  const tc     = scored.reduce((n, x) => n + getCompte(x), 0);
  const ts     = scored.reduce((n, x) => n + x.score, 0);
  const tt     = tp + tb + group.reduce((n, x) => n + getCompte(x), 0);
  const tmoy   = tc > 0 ? ts / tc : null;
  const dists  = [...new Set(scored.map(x => x.distance))];
  const tscoreMoy = tmoy != null && dists.length === 1
    ? Math.round(tmoy * normFactor(dists[0])) : null;
  return { tp, tb, tc, ts, tt, tmoy, tscoreMoy };
};
