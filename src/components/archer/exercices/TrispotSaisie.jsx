import { useRef, useState } from "react";
import { PINK } from "./exerciceStyles";
import { RAYON_MAX, rayonX, anneauxBlason, positionDepuisClic, zoneDepuisRayon } from "./cibleBlason";

// Un vrai trispot ne porte que les zones 10 à 6 (les flèches tombent toutes
// près du centre vu la petite taille de chaque spot) — pas de zones 5 à 1.
const NB_ANNEAUX = 5;
const LARGEUR_ANNEAU = RAYON_MAX / NB_ANNEAUX;

// Autour du spot, un anneau blanc de la largeur d'une zone sert à saisir une
// flèche manquée (M). Le dessin est réduit pour que spot + anneau tiennent dans le cadre.
const RAYON_BLANC = RAYON_MAX + LARGEUR_ANNEAU;
const ECHELLE = 97 / RAYON_BLANC;

// Loupe affichée pendant la visée, au-dessus du doigt.
const ZOOM = 3;
const TAILLE_LOUPE = 110; // px
const ECART_LOUPE = 24;   // px entre le doigt et le bas de la loupe

// Dessin d'un spot (coordonnées du viewBox 0..200), partagé par le spot et la loupe.
function DessinSpot({ code, impact, rempli }) {
  return (
    <>
      <g transform={`translate(100,100) scale(${ECHELLE})`}>
        <circle r={RAYON_BLANC} fill="#ffffff" stroke="#00000025" strokeWidth="0.8" />
        {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
        <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
        {rempli && impact && (
          <circle cx={impact.x * RAYON_MAX} cy={impact.y * RAYON_MAX} r={7 / ECHELLE} fill={PINK} stroke="#fff" strokeWidth={1.2 / ECHELLE} />
        )}
      </g>
      {rempli && !impact && (
        <text x="100" y="107" textAnchor="middle" fontSize="24" fontWeight="700" fill={PINK}
          stroke="#fff" strokeWidth="0.6" paintOrder="stroke" style={{ fontFamily: "inherit" }}>
          {code}
        </text>
      )}
    </>
  );
}

// Un blason trispot : une petite cible par flèche de la volée (3 pour une
// épreuve salle), au lieu d'un seul grand blason pour toutes les flèches.
// Sur la cible active (bord rose), posez le doigt : une loupe montre où vous
// visez, glissez pour ajuster, levez le doigt pour valider. Touchez une cible
// déjà remplie pour la sélectionner et la corriger.
function Spot({ index, code, impact, actif, rempli, onImpact, onSelectionner, disabled }) {
  const svgRef = useRef(null);
  const [visee, setVisee] = useState(null); // { px, py, zone, gauche, haut } pendant la visée
  const cliquable = !disabled && (actif || rempli);

  const lirePosition = (e) => {
    const { x, y, rayon } = positionDepuisClic(svgRef.current, e.clientX, e.clientY);
    const rect = svgRef.current.getBoundingClientRect();
    return {
      px: x * RAYON_MAX, py: y * RAYON_MAX, // coordonnées dans le viewBox, centrées
      impact: { x: x / ECHELLE, y: y / ECHELLE },
      zone: zoneDepuisRayon(rayon / ECHELLE, NB_ANNEAUX),
      gauche: e.clientX - rect.left, haut: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    if (rempli && !actif) { onSelectionner?.(index); return; }
    if (!actif) return;
    e.preventDefault();
    svgRef.current.setPointerCapture?.(e.pointerId);
    setVisee(lirePosition(e));
  };

  const handlePointerMove = (e) => {
    if (visee) setVisee(lirePosition(e));
  };

  const handlePointerUp = (e) => {
    if (!visee) return;
    const p = lirePosition(e);
    setVisee(null);
    onImpact?.(p.zone, p.impact);
  };

  const W = 200 / ZOOM;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "140px" }}>
      <svg
        ref={svgRef} viewBox="0 0 200 200" role="img" aria-label={`Flèche ${index + 1}`}
        style={{
          width: "100%", aspectRatio: "1", display: "block",
          touchAction: "none", userSelect: "none", cursor: cliquable ? "pointer" : "default",
          opacity: disabled ? 0.5 : (actif || rempli ? 1 : 0.35),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setVisee(null)}
      >
        <DessinSpot code={code} impact={impact} rempli={rempli && !(actif && visee)} />
        {actif && <circle cx="100" cy="100" r="98.5" fill="none" stroke={PINK} strokeWidth="3" />}
        {visee && <circle cx={100 + visee.px} cy={100 + visee.py} r="4" fill={PINK} stroke="#fff" strokeWidth="1.2" />}
      </svg>

      {visee && (
        <div
          style={{
            position: "absolute", pointerEvents: "none", zIndex: 10,
            width: `${TAILLE_LOUPE}px`, height: `${TAILLE_LOUPE}px`,
            left: `${visee.gauche - TAILLE_LOUPE / 2}px`, top: `${visee.haut - TAILLE_LOUPE - ECART_LOUPE}px`,
            borderRadius: "50%", overflow: "hidden", border: `3px solid ${PINK}`,
            backgroundColor: "#ffffff", boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <svg
            viewBox={`${100 + visee.px - W / 2} ${100 + visee.py - W / 2} ${W} ${W}`}
            style={{ width: "100%", height: "100%", display: "block" }}
          >
            <DessinSpot code={code} impact={impact} rempli={false} />
            {/* Croix de visée au centre de la loupe */}
            <g stroke="#000" strokeWidth={0.6} opacity="0.75">
              <line x1={100 + visee.px - W / 6} y1={100 + visee.py} x2={100 + visee.px + W / 6} y2={100 + visee.py} />
              <line x1={100 + visee.px} y1={100 + visee.py - W / 6} x2={100 + visee.px} y2={100 + visee.py + W / 6} />
            </g>
            <circle cx={100 + visee.px} cy={100 + visee.py} r={1.6} fill={PINK} stroke="#fff" strokeWidth={0.4} />
          </svg>
          <span
            style={{
              position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)",
              backgroundColor: PINK, color: "#fff", borderRadius: "6px", padding: "1px 8px",
              fontSize: "14px", fontWeight: "700", fontFamily: "var(--mono)",
            }}
          >
            {visee.zone}
          </span>
        </div>
      )}
    </div>
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
