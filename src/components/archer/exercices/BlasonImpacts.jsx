import { RAYON_MAX, rayonX, anneauxBlason, zoneDepuisRayon } from "./cibleBlason";
import { PINK } from "./exerciceStyles";

const NB_ANNEAUX = 10;

// Les impacts sont enregistrés en position normalisée sur le blason où ils ont
// été saisis : blason complet (10 anneaux) ou spot de trispot (5 anneaux, zones
// 10 à 6). Le mode n'est pas stocké, mais la valeur de la flèche le trahit :
// un impact dont la zone correspond au trispot est ramené à l'échelle du
// blason complet (les anneaux 10 à 6 y occupent la moitié du rayon).
function versBlasonComplet(code, p) {
  const r = Math.hypot(p.x, p.y) * RAYON_MAX;
  if (zoneDepuisRayon(r, NB_ANNEAUX) === code) return p;
  if (zoneDepuisRayon(r, 5) === code) return { x: p.x / 2, y: p.y / 2 };
  return p;
}

// Blason en lecture seule avec tous les impacts d'un tir.
// `fleches` : [{ code, x, y }, ...]
export default function BlasonImpacts({ fleches, taille = 240 }) {
  const points = fleches.map((f) => ({ code: f.code, ...versBlasonComplet(f.code, f) }));
  return (
    <svg
      viewBox="0 0 200 200" role="img" aria-label={`Blason — ${points.length} impacts`}
      style={{ width: "100%", maxWidth: `${taille}px`, aspectRatio: "1", display: "block" }}
    >
      <g transform="translate(100,100)">
        {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
        <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x * RAYON_MAX} cy={p.y * RAYON_MAX} r="3"
            fill={PINK} fillOpacity="0.85" stroke="#fff" strokeWidth="0.8" />
        ))}
      </g>
    </svg>
  );
}
