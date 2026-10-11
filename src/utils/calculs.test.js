// Tests des calculs (records, objectifs, tir compté, séances, connexion).
// Lancer : npm test
import { describe, it, expect } from "vitest";
import { pointsZone } from "./blason";
import { slug } from "./slug";
import { getSaison, nbSeances, retoursNonLus, fmtDateLongue, fmtDateCourte, jourDate, couleurJaugeVolume, parOrdreDeTir } from "./seances";
import { scoreEpreuve, scoreSerie, niveauEpreuves } from "./records";
import { resumeTir, epreuveStandard, positionEpreuve, reussite, groupement, directionDecalage, texteGroupement } from "./tirCompte";
import { protocoleDe, commentaireSeanceDe, commentaireExerciceDe } from "./exercices";
import { impactDeTrispot, tirSurTrispot } from "../components/archer/exercices/cibleBlason";

// Volées de 3 flèches identiques (format salle).
const volees = (n, code) => Array.from({ length: n }, () => [code, code, code]);

describe("pointsZone", () => {
  it("X vaut 10, M vaut 0, les autres leur valeur", () => {
    expect(pointsZone("X")).toBe(10);
    expect(pointsZone("10")).toBe(10);
    expect(pointsZone("7")).toBe(7);
    expect(pointsZone("M")).toBe(0);
  });
});

describe("slug (identifiant de connexion)", () => {
  it("ignore accents, majuscules et apostrophes", () => {
    expect(slug("Céline", "BAJARD")).toBe("celine_bajard");
    expect(slug("Celine", "bajard")).toBe("celine_bajard");
    expect(slug("Florence", "Le Manac’h")).toBe("florence_le_manach");
    expect(slug("  Florence ", "Le  Manac'h")).toBe("florence_le_manach");
  });
});

describe("getSaison", () => {
  it("la saison commence en septembre", () => {
    expect(getSaison("2026-08-31")).toBe("2025/2026");
    expect(getSaison("2026-09-01")).toBe("2026/2027");
    expect(getSaison("2027-01-15")).toBe("2026/2027");
  });
});

describe("dates et jauges", () => {
  it("dates en toutes lettres", () => {
    expect(fmtDateLongue("2026-10-10")).toBe("Samedi 10 octobre");
    expect(fmtDateLongue("2026-10-10", true)).toBe("Samedi 10 octobre 2026");
    expect(fmtDateCourte("2026-10-10")).toBe("10 oct. 2026");
    expect(jourDate("2026-10-10")).toEqual({ semaine: "sam.", num: 10 });
  });
  it("couleur de la jauge de volume selon l'avancement", () => {
    expect(couleurJaugeVolume(100)).toBe("#FF007A");
    expect(couleurJaugeVolume(85)).toBe("var(--ok)");
    expect(couleurJaugeVolume(60)).toBe("var(--warn)");
    expect(couleurJaugeVolume(29)).toBe("var(--bad)");
  });
});

describe("groupement", () => {
  it("centre, cercle des 80 % et décalage", () => {
    // 5 flèches serrées en haut à droite, 1 écartée : le cercle des 80 % l'ignore.
    const pts = [
      { x: 0.20, y: -0.20 }, { x: 0.22, y: -0.18 }, { x: 0.18, y: -0.22 },
      { x: 0.21, y: -0.21 }, { x: 0.19, y: -0.19 }, { x: 0.20, y: 0.40 },
    ];
    const g = groupement(pts);
    expect(g.n).toBe(6);
    expect(g.centre.x).toBeCloseTo(0.2, 2);
    expect(g.r80).toBeLessThan(0.15);
    expect(directionDecalage(g.centre)).toBe("en haut à droite");
    expect(directionDecalage({ x: 0.01, y: -0.02 })).toBeNull();
    expect(texteGroupement({ centre: { x: 0, y: 0 }, r80: 0.16 }, 0.1)).toBe("80 % des flèches dans un rayon de 1,6 zone · bien centré");
  });
  it("pas de groupement sous 3 impacts", () => {
    expect(groupement([{ x: 0, y: 0 }, null, { x: 0.1, y: 0 }])).toBeNull();
  });
});

describe("tir saisi au trispot", () => {
  // À 0,3 du rayon : zone 9 sur un spot de trispot (5 anneaux), zone 8 sur un blason complet.
  const p = { x: 0.3, y: 0 };
  it("reconnaît un impact de trispot par sa valeur", () => {
    expect(impactDeTrispot("9", p)).toBe(true);
    expect(impactDeTrispot("8", p)).toBe(false);
  });
  it("mode enregistré, sinon déduit des impacts", () => {
    expect(tirSurTrispot({ saisie: "trispot", volees: [] })).toBe(true);
    expect(tirSurTrispot({ saisie: "blason", volees: [{ codes: ["9"], impacts: [p] }] })).toBe(false);
    expect(tirSurTrispot({ volees: [{ codes: ["9", "9"], impacts: [p, p] }] })).toBe(true);
    expect(tirSurTrispot({ saisie: "clavier", volees: [{ codes: ["8"], impacts: [p] }] })).toBe(false);
  });
});

describe("parOrdreDeTir", () => {
  it("trie les exercices par heure d'enregistrement, ceux sans heure en premier", () => {
    const a = (ms, id) => ({ id, createdAt: { toMillis: () => ms } });
    const docs = [a(3000, "c"), a(1000, "a"), { id: "sans" }, a(2000, "b")];
    expect([...docs].sort(parOrdreDeTir).map((d) => d.id)).toEqual(["sans", "a", "b", "c"]);
  });
});

describe("nbSeances", () => {
  it("compte les séances, pas les exercices", () => {
    const docs = [{ id: "a", seanceId: "s1" }, { id: "b", seanceId: "s1" }, { id: "c" }];
    expect(nbSeances(docs)).toBe(2);
  });
});

describe("retoursNonLus", () => {
  it("une entrée par séance, seulement les retours marqués non lus, la plus récente d'abord", () => {
    const docs = [
      { id: "a", seanceId: "s1", date: "2026-10-01", retourCoach: "Bien", retourCoachLu: false },
      { id: "b", seanceId: "s1", date: "2026-10-01", retourCoach: "Bien", retourCoachLu: false },
      { id: "c", seanceId: "s2", date: "2026-10-05", retourCoach: "Super", retourCoachLu: false },
      { id: "d", seanceId: "s3", date: "2026-10-06", retourCoach: "Lu", retourCoachLu: true },
      { id: "e", seanceId: "s4", date: "2026-10-07", retourCoach: "Ancien" }, // avant la notification : lu
    ];
    expect(retoursNonLus(docs).map((r) => r.cle)).toEqual(["s2", "s1"]);
  });
});

describe("scoreEpreuve (records sur 600 / 720)", () => {
  it("épreuve complète en salle : score ramené sur 600", () => {
    expect(scoreEpreuve({ distance: "18m", volumeCompte: 60, score: 540 })).toBe(540);
  });
  it("au-delà de 60 flèches : score ramené sur 600", () => {
    expect(scoreEpreuve({ distance: "18m", volumeCompte: 90, score: 810 })).toBe(540);
  });
  it("moins de 2 séries : pas de record d'épreuve", () => {
    expect(scoreEpreuve({ distance: "18m", volumeCompte: 30, score: 280 })).toBeNull();
  });
  it("extérieur : 72 flèches, sur 720", () => {
    expect(scoreEpreuve({ distance: "70m", volumeCompte: 72, score: 600 })).toBe(600);
    expect(scoreEpreuve({ distance: "70m", volumeCompte: 60, score: 500 })).toBeNull();
  });
  it("sans score (volume) : pas de record", () => {
    expect(scoreEpreuve({ distance: "18m", volumePaille: 60, score: 0 })).toBeNull();
  });
});

describe("scoreSerie (série record sur 300 / 360)", () => {
  it("saisie d'une seule série : score ramené sur 300", () => {
    expect(scoreSerie({ distance: "18m", volumeCompte: 30, score: 270 })).toBe(270);
  });
  it("épreuve complète saisie en bloc : pas de série record (c'est un record d'épreuve)", () => {
    expect(scoreSerie({ distance: "18m", volumeCompte: 60, score: 540 })).toBeNull();
  });
  it("tir compté détaillé : la meilleure série complète", () => {
    const s = {
      protocole: "tir-compte", distance: "18m", nbSeries: 2,
      volees: [...volees(10, "9"), ...volees(10, "10")].map((codes) => ({ codes })),
      volumeCompte: 60, score: 570,
    };
    expect(scoreSerie(s)).toBe(300);
  });
});

describe("niveauEpreuves (objectifs)", () => {
  const seances = [
    { distance: "18m", type: "Entraînement", date: "2026-10-01", volumeCompte: 60, score: 500 },
    { distance: "18m", type: "Entraînement", date: "2026-10-02", volumeCompte: 60, score: 520 },
    { distance: "18m", type: "Entraînement", date: "2026-10-03", volumeCompte: 60, score: 540 },
    { distance: "18m", type: "Entraînement", date: "2026-10-04", volumeCompte: 60, score: 400 },
    { distance: "18m", type: "Entraînement", date: "2026-10-05", volumeCompte: 30, score: 300 }, // une série : ignorée
    { distance: "18m", type: "Entraînement", date: "2026-03-01", volumeCompte: 60, score: 590 }, // saison précédente
    { distance: "18m", type: "Compétition",  date: "2026-10-06", volumeCompte: 60, score: 580 }, // autre type
  ];
  it("moyenne des 3 meilleures épreuves complètes de la saison et du type", () => {
    expect(niveauEpreuves(seances, { distance: "18m", type: "Entraînement", saison: "2026/2027" })).toBe(520);
  });
  it("« Toutes » les saisons", () => {
    expect(niveauEpreuves(seances, { distance: "18m", type: "Entraînement", saison: "Toutes" })).toBe(550);
  });
  it("aucune épreuve complète : null", () => {
    expect(niveauEpreuves(seances, { distance: "70m", type: "Entraînement", saison: "2026/2027" })).toBeNull();
  });
});

describe("tir compté", () => {
  it("épreuve standard : salle 2 × 10 volées de 3, extérieur 2 × 6 volées de 6", () => {
    expect(epreuveStandard("18m")).toEqual({ flechesParVolee: 3, voleesParSerie: 10, series: 2 });
    expect(epreuveStandard("70m")).toEqual({ flechesParVolee: 6, voleesParSerie: 6, series: 2 });
  });
  it("résumé : total, moyenne, X, 10+X, manqués et séries", () => {
    const tir = [["X", "10", "9"], ["M", "8", "X"]];
    const r = resumeTir(tir, { flechesParVolee: 3, voleesParSerie: 1, nbSeries: 2 });
    expect(r.total).toBe(47);
    expect(r.fleches).toBe(6);
    expect(r.x).toBe(2);
    expect(r.dixPlusX).toBe(3);
    expect(r.manques).toBe(1);
    expect(r.series.map((se) => se.total)).toEqual([29, 18]);
    expect(r.series.every((se) => se.complete)).toBe(true);
  });
  it("zone de réussite : % de flèches dans la zone visée, en tout et par série", () => {
    const tir = [["X", "10", "9"], ["8", "7", "M"], ["9", "9", "6"], ["10", "8", "8"]];
    const r = reussite(tir, "8", 2);
    expect(r).toMatchObject({ dans: 9, total: 12, pct: 75 });
    expect(r.parSerie.map((se) => se.pct)).toEqual([67, 83]);
    expect(reussite(tir, "10").dans).toBe(3);   // X compte dans le 10
    expect(reussite(tir, "X").dans).toBe(1);
    expect(reussite([], "8").pct).toBeNull();
  });
  it("position dans l'épreuve et fin d'épreuve", () => {
    const reglages = { voleesParSerie: 10, nbSeries: 2 };
    expect(positionEpreuve(0, 0, reglages)).toEqual({ serie: 1, volee: 1, terminee: false });
    expect(positionEpreuve(10, 0, reglages)).toEqual({ serie: 2, volee: 1, terminee: false });
    expect(positionEpreuve(20, 0, reglages).terminee).toBe(true);
  });
});

describe("protocoles et commentaires", () => {
  it("un protocole inconnu ou abandonné est traité comme une saisie manuelle", () => {
    expect(protocoleDe({ protocole: "zone" })).toBe("manuel");
    expect(protocoleDe({})).toBe("manuel");
    expect(protocoleDe({ protocole: "volume" })).toBe("volume");
  });
  it("le commentaire d'une saisie manuelle est un commentaire de séance", () => {
    const manuel = { protocole: "manuel", commentaire: " Bonne séance " };
    expect(commentaireSeanceDe(manuel)).toBe("Bonne séance");
    expect(commentaireExerciceDe(manuel)).toBe("");
    const volume = { protocole: "volume", commentaire: "Fatigue" };
    expect(commentaireSeanceDe(volume)).toBe("");
    expect(commentaireExerciceDe(volume)).toBe("Fatigue");
  });
});
