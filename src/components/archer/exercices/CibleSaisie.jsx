import { useRef } from "react";

// Blason standard à 10 zones (+ X), anneaux de largeur égale, couleurs réelles
// (or, rouge, bleu clair, noir, blanc) — littérales : un blason ne se réinterprète
// pas selon le thème de l'app, c'est un objet réel reconnaissable.
const RAYON_MAX = 95;
const RAYON_X = 4.75;
const ANNEAUX = [
  { valeur: "1",  r: 95.0, fill: "#f3f1ea", stroke: "#00000030" },
  { valeur: "2",  r: 85.5, fill: "#f3f1ea", stroke: "#00000030" },
  { valeur: "3",  r: 76.0, fill: "#19191a", stroke: "#ffffff30" },
  { valeur: "4",  r: 66.5, fill: "#19191a", stroke: "#ffffff30" },
  { valeur: "5",  r: 57.0, fill: "#4fa8d8", stroke: "#00000030" },
  { valeur: "6",  r: 47.5, fill: "#4fa8d8", stroke: "#00000030" },
  { valeur: "7",  r: 38.0, fill: "#d6342f", stroke: "#00000030" },
  { valeur: "8",  r: 28.5, fill: "#d6342f", stroke: "#00000030" },
  { valeur: "9",  r: 19.0, fill: "#f2c84b", stroke: "#00000030" },
  { valeur: "10", r: 9.5,  fill: "#f2c84b", stroke: "#00000030" },
];

function zoneDepuisRayon(r) {
  if (r > RAYON_MAX) return "M";
  if (r <= RAYON_X) return "X";
  const anneau = Math.ceil(r / (RAYON_MAX / 10)); // 1 (centre) .. 10 (bord)
  return String(11 - anneau);
}

// `onImpact(code, position)` — position normalisée (x, y dans [-1,1], y positif = vers le bas).
export default function CibleSaisie({ onImpact, impactsRecents = [], impactsEstompes = [], disabled }) {
  const svgRef = useRef(null);

  const handleClick = (e) => {
    if (disabled) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 200 - 100;
    const py = ((e.clientY - rect.top) / rect.height) * 200 - 100;
    const r = Math.hypot(px, py);
    onImpact?.(zoneDepuisRayon(r), { x: px / RAYON_MAX, y: py / RAYON_MAX });
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
        {ANNEAUX.map((a) => (
          <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />
        ))}
        <circle r={RAYON_X} fill="none" stroke="#b8942a" strokeWidth="0.6" />
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
