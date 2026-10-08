import { useRef } from "react";
import { RAYON_MAX, rayonX, anneauxBlason, positionDepuisClic, zoneDepuisRayon } from "./cibleBlason";

const NB_ANNEAUX = 10; // blason complet : zones 10 à 1

// `onImpact(code, position)` — position normalisée (x, y dans [-1,1], y positif = vers le bas).
export default function CibleSaisie({ onImpact, impactsRecents = [], impactsEstompes = [], disabled }) {
  const svgRef = useRef(null);

  const handleClick = (e) => {
    if (disabled) return;
    const { x, y, rayon } = positionDepuisClic(svgRef.current, e.clientX, e.clientY);
    onImpact?.(zoneDepuisRayon(rayon, NB_ANNEAUX), { x, y });
  };

  return (
    <svg
      ref={svgRef} viewBox="0 0 200 200" role="img" aria-label="Blason — touchez pour saisir l'impact"
      style={{
        width: "100%", maxWidth: "260px", aspectRatio: "1", margin: "0 auto", display: "block",
        touchAction: "none", cursor: disabled ? "default" : "crosshair", opacity: disabled ? 0.5 : 1,
      }}
      onClick={handleClick}
    >
      <g transform="translate(100,100)">
        {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
        <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
        {impactsEstompes.map((p, i) => (
          <circle key={`e${i}`} cx={p.x * RAYON_MAX} cy={p.y * RAYON_MAX} r="2.4"
            fill="rgba(255,0,122,0.3)" stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" />
        ))}
        {impactsRecents.map((p, i) => (
          <circle key={`r${i}`} cx={p.x * RAYON_MAX} cy={p.y * RAYON_MAX} r="3"
            fill="#FF007A" stroke="#fff" strokeWidth="0.6" />
        ))}
      </g>
    </svg>
  );
}
