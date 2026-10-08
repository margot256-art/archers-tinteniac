import { useRef } from "react";
import { PINK } from "./exerciceStyles";
import { RAYON_MAX, rayonX, anneauxBlason, positionDepuisClic, zoneDepuisRayon } from "./cibleBlason";

// Un vrai trispot ne porte que les zones 10 à 6 (les flèches tombent toutes
// près du centre vu la petite taille de chaque spot) — pas de zones 5 à 1.
const NB_ANNEAUX = 5;

// Un blason trispot : une petite cible par flèche de la volée (3 pour une
// épreuve salle), au lieu d'un seul grand blason pour toutes les flèches.
// Touchez la cible active (bord rose) pour saisir ; touchez une cible déjà
// remplie pour la sélectionner et la corriger.
function Spot({ index, code, impact, actif, rempli, onImpact, onSelectionner, disabled }) {
  const svgRef = useRef(null);
  const cliquable = !disabled && (actif || rempli);

  const handleClick = (e) => {
    if (disabled) return;
    if (rempli) { onSelectionner?.(index); return; }
    if (!actif) return;
    const { x, y, rayon } = positionDepuisClic(svgRef.current, e.clientX, e.clientY);
    onImpact?.(zoneDepuisRayon(rayon, NB_ANNEAUX), { x, y });
  };

  return (
    <svg
      ref={svgRef} viewBox="0 0 200 200" role="img" aria-label={`Flèche ${index + 1}`}
      style={{
        width: "100%", maxWidth: "120px", aspectRatio: "1", display: "block",
        touchAction: "none", cursor: cliquable ? "pointer" : "default",
        opacity: disabled ? 0.5 : (actif || rempli ? 1 : 0.35),
      }}
      onClick={handleClick}
    >
      <g transform="translate(100,100)">
        {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
        <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
        {rempli && impact && (
          <circle cx={impact.x * RAYON_MAX} cy={impact.y * RAYON_MAX} r="7" fill={PINK} stroke="#fff" strokeWidth="1.2" />
        )}
        {rempli && !impact && (
          <text x="0" y="7" textAnchor="middle" fontSize="24" fontWeight="700" fill={PINK}
            stroke="#fff" strokeWidth="0.6" paintOrder="stroke" style={{ fontFamily: "inherit" }}>
            {code}
          </text>
        )}
      </g>
      {actif && <circle cx="100" cy="100" r="98" fill="none" stroke={PINK} strokeWidth="3" />}
    </svg>
  );
}

export default function TrispotSaisie({ voleeEnCours, impactEnCours = [], fpv, selection, onImpact, onSelectionner, disabled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
      {Array.from({ length: fpv }, (_, i) => (
        <Spot
          key={i} index={i}
          code={voleeEnCours[i]} impact={impactEnCours[i] ?? null}
          rempli={i < voleeEnCours.length}
          actif={selection !== null ? i === selection : i === voleeEnCours.length}
          onImpact={onImpact} onSelectionner={onSelectionner}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
