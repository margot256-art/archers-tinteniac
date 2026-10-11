import { RAYON_MAX, rayonX, anneauxBlason } from "./cibleBlason";
import { PINK } from "./exerciceStyles";
import { ReperesGroupement } from "./BlasonImpacts";
import { groupement, rayonEnZones, directionDecalage } from "../../../utils/tirCompte";

// Trispot : zones 10 à 6 seulement, entouré d'un anneau blanc (comme à la saisie).
const NB_ANNEAUX = 5;
const RAYON_BLANC = RAYON_MAX + RAYON_MAX / NB_ANNEAUX;
const LARGEUR_ZONE = 1 / NB_ANNEAUX; // en position normalisée au spot

// Trispot en lecture seule : les 3 spots superposés comme sur le blason de salle,
// chaque flèche sur le spot où elle a été tirée (1re flèche de la volée → spot du
// haut, etc.), avec les repères de groupement de chaque spot : croix au centre,
// cercle contenant 80 % des flèches, et sa taille et son décalage en dessous.
// `volees` : [{ codes, impacts }, ...] tel qu'enregistré (impacts normalisés au spot).
export default function TrispotImpacts({ volees, taille = 92 }) {
  const parSpot = [[], [], []];
  for (const v of volees) {
    (v.impacts ?? []).forEach((p, i) => { if (p) parSpot[i % 3].push(p); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
      {parSpot.map((points, n) => {
        const g = groupement(points);
        const dir = g && directionDecalage(g.centre);
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg
              viewBox={`${-RAYON_BLANC} ${-RAYON_BLANC} ${2 * RAYON_BLANC} ${2 * RAYON_BLANC}`}
              role="img" aria-label={`Spot ${n + 1} — ${points.length} impact${points.length > 1 ? "s" : ""}`}
              style={{ width: `${taille}px`, aspectRatio: "1", display: "block", flex: "0 0 auto" }}
            >
              <circle r={RAYON_BLANC - 0.5} fill="#ffffff" stroke="#00000025" strokeWidth="0.8" />
              {anneauxBlason(NB_ANNEAUX).map((a) => <circle key={a.valeur} r={a.r} fill={a.fill} stroke={a.stroke} strokeWidth="0.5" />)}
              <circle r={rayonX(NB_ANNEAUX)} fill="none" stroke="#b8942a" strokeWidth="0.6" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x * RAYON_MAX} cy={p.y * RAYON_MAX} r="5"
                  fill={PINK} fillOpacity="0.85" stroke="#fff" strokeWidth="1" />
              ))}
              <ReperesGroupement g={g} rayonMax={RAYON_MAX} epaisseur={1.6} />
            </svg>
            <span style={legende}>
              <strong style={legendeTitre}>Spot {n + 1}</strong>
              {g ? (
                <>
                  <span>rayon {rayonEnZones(g, LARGEUR_ZONE).toFixed(1).replace(".", ",")} zone{rayonEnZones(g, LARGEUR_ZONE) >= 2 ? "s" : ""}</span>
                  <span>{dir ? `décalé ${dir}` : "bien centré"}</span>
                </>
              ) : (
                <span>{points.length ? "trop peu d'impacts" : "aucun impact"}</span>
              )}
            </span>
          </div>
        );
      })}
      <p style={note}>Cercle : 80 % des flèches du spot · croix : centre du groupement</p>
    </div>
  );
}

const legende = { display: "flex", flexDirection: "column", gap: "1px", fontSize: "11px", color: "var(--text-muted)", minWidth: "96px" };
const legendeTitre = { fontSize: "11px", fontWeight: "700", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em" };
const note = { fontSize: "11px", color: "var(--text-dim)", margin: 0, textAlign: "center" };
