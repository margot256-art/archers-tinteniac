import { RAYON_MAX, rayonX, anneauxBlason } from "./cibleBlason";
import { PINK } from "./exerciceStyles";

// Trispot : zones 10 à 6 seulement, entouré d'un anneau blanc (comme à la saisie).
const NB_ANNEAUX = 5;
const RAYON_BLANC = RAYON_MAX + RAYON_MAX / NB_ANNEAUX;

// Trispot en lecture seule : les 3 spots superposés comme sur le blason de salle,
// chaque flèche sur le spot où elle a été tirée (1re flèche de la volée → spot du
// haut, etc.), pour voir le groupement spot par spot.
// `volees` : [{ codes, impacts }, ...] tel qu'enregistré (impacts normalisés au spot).
export default function TrispotImpacts({ volees, taille = 92 }) {
  const parSpot = [[], [], []];
  for (const v of volees) {
    (v.impacts ?? []).forEach((p, i) => { if (p) parSpot[i % 3].push(p); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
      {parSpot.map((points, n) => (
        <svg
          key={n}
          viewBox={`${-RAYON_BLANC} ${-RAYON_BLANC} ${2 * RAYON_BLANC} ${2 * RAYON_BLANC}`}
          role="img" aria-label={`Spot ${n + 1} — ${points.length} impact${points.length > 1 ? "s" : ""}`}
          style={{ width: "100%", maxWidth: `${taille}px`, aspectRatio: "1", display: "block" }}
        >
          <circle r={RAYON_BLANC - 0.5} fill="#ffffff" stroke="#00000025" strokeWidth="0.8" />
          {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
          <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x * RAYON_MAX} cy={p.y * RAYON_MAX} r="5"
              fill={PINK} fillOpacity="0.85" stroke="#fff" strokeWidth="1" />
          ))}
        </svg>
      ))}
    </div>
  );
}
