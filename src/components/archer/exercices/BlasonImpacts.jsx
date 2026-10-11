import { RAYON_MAX, rayonX, anneauxBlason, zoneDepuisRayon } from "./cibleBlason";
import { PINK } from "./exerciceStyles";
import { groupement, texteGroupement } from "../../../utils/tirCompte";

const NB_ANNEAUX = 10;
const LARGEUR_ZONE = 1 / NB_ANNEAUX; // en position normalisée

// Les impacts sont enregistrés en position normalisée sur le blason où ils ont
// été saisis : blason complet (10 anneaux) ou spot de trispot (5 anneaux, zones
// 10 à 6). Le mode n'est pas toujours connu, mais la valeur de la flèche le
// trahit : un impact dont la zone correspond au trispot est ramené à l'échelle
// du blason complet (les anneaux 10 à 6 y occupent la moitié du rayon).
function versBlasonComplet(code, p) {
  const r = Math.hypot(p.x, p.y) * RAYON_MAX;
  if (zoneDepuisRayon(r, NB_ANNEAUX) === code) return p;
  if (zoneDepuisRayon(r, 5) === code) return { x: p.x / 2, y: p.y / 2 };
  return p;
}

/** Repères de groupement à dessiner dans un <g> centré : cercle des 80 % et croix au centre. */
export function ReperesGroupement({ g, rayonMax, epaisseur = 1 }) {
  if (!g) return null;
  const cx = g.centre.x * rayonMax, cy = g.centre.y * rayonMax, r = g.r80 * rayonMax;
  const bras = 6 * epaisseur;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth={2.6 * epaisseur} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth={1.2 * epaisseur} strokeDasharray={`${4 * epaisseur} ${3 * epaisseur}`} />
      <g stroke="#000" strokeWidth={3 * epaisseur} strokeOpacity="0.55">
        <line x1={cx - bras} y1={cy} x2={cx + bras} y2={cy} />
        <line x1={cx} y1={cy - bras} x2={cx} y2={cy + bras} />
      </g>
      <g stroke="#fff" strokeWidth={1.4 * epaisseur}>
        <line x1={cx - bras} y1={cy} x2={cx + bras} y2={cy} />
        <line x1={cx} y1={cy - bras} x2={cx} y2={cy + bras} />
      </g>
    </g>
  );
}

// Blason en lecture seule avec tous les impacts d'un tir, et les repères de
// groupement : croix au centre du groupement, cercle contenant 80 % des flèches.
// `fleches` : [{ code, x, y }, ...]
export default function BlasonImpacts({ fleches, taille = 240 }) {
  const points = fleches.map((f) => ({ code: f.code, ...versBlasonComplet(f.code, f) }));
  const g = groupement(points);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", width: "100%" }}>
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
          <ReperesGroupement g={g} rayonMax={RAYON_MAX} />
        </g>
      </svg>
      {g && (
        <p style={texte}>{texteGroupement(g, LARGEUR_ZONE)}</p>
      )}
    </div>
  );
}

const texte = { fontSize: "12px", color: "var(--text-muted)", margin: 0, textAlign: "center", lineHeight: 1.45 };
