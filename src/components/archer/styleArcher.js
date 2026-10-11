// Styles communs aux écrans de l’appli (partie Archer et partie Coach) : même
// largeur, mêmes titres, mêmes chiffres, mêmes bascules et points de couleur,
// pour que les onglets se ressemblent.
// Règles : libellés en texte simple (pas de MAJUSCULES), chiffres dans la police du
// texte (pas de police « machine à écrire »), rose / bleu réservés aux scores et
// aux repères Entraînement / Compétition.
import { PRIMARY as PINK } from "../../utils/seances";

export const page = {
  display: "flex", flexDirection: "column", gap: "16px",
  width: "100%", maxWidth: "820px", margin: "0 auto",
};

// Pages à tableaux larges (Journal coach, Progression club) : même centrage, plus de place.
export const pageLarge = { ...page, maxWidth: "1180px" };

export const carte = {
  backgroundColor: "var(--surface)", borderRadius: "14px", border: "1px solid var(--border)",
  boxShadow: "var(--shadow-card)",
};

export const titreSection = { fontFamily: "var(--display)", fontSize: "19px", fontWeight: "600", color: "var(--text)", margin: 0 };
export const sousTitre = { fontSize: "13px", color: "var(--text-muted)", margin: 0 };

// Barre de filtres : en haut à gauche, sur une ou deux lignes.
export const filtres = { display: "flex", alignItems: "center", gap: "10px 14px", flexWrap: "wrap" };
export const barre = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px 14px", flexWrap: "wrap" };

// Bascule (Séances / Commentaires, Totaux / Courbes, Entraînement / Compétition).
export const bascule = {
  display: "flex", gap: "2px", padding: "3px", borderRadius: "10px",
  backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)",
};
export const basculeBtn = {
  backgroundColor: "transparent", border: "none", borderRadius: "8px", padding: "6px 12px",
  fontSize: "13px", fontWeight: "600", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
};
export const basculeBtnActif = { backgroundColor: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-card)" };

// Bouton secondaire discret (exports, actions de page).
export const boutonSecondaire = {
  backgroundColor: "transparent", color: "var(--text-2)", border: "1px solid var(--border-3)",
  borderRadius: "8px", padding: "7px 12px", fontSize: "13px", fontWeight: "600",
  cursor: "pointer", fontFamily: "inherit",
};

// Chiffre clé : valeur en avant, libellé discret en dessous.
export const statValeur = { fontSize: "16px", fontWeight: "700", color: "var(--text)", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" };
export const statLabel = { fontSize: "11px", color: "var(--text-muted)" };

// Point de couleur devant « Entraînement » / « Compétition ».
export const point = (couleur) => ({
  width: "8px", height: "8px", borderRadius: "50%", display: "inline-block", flex: "0 0 auto", backgroundColor: couleur,
});

export const vide = { ...carte, padding: "36px", textAlign: "center", color: "var(--text-dim)", fontSize: "14px" };
export const info = { color: "var(--text-muted)", fontSize: "14px" };
export const erreur = {
  color: PINK, fontSize: "13px", padding: "10px 14px",
  backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PINK}`,
};

// Chiffre clé en tête de page (tableau de bord, progression club).
export const kpi = { ...carte, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "4px" };
export const kpiValeur = { fontFamily: "var(--display)", fontSize: "26px", fontWeight: "600", color: "var(--text)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" };
export const kpiLabel = { fontSize: "13px", color: "var(--text-muted)" };

// Tableaux (pages coach) : en-têtes en texte simple, chiffres alignés.
export const tableauCadre = { ...carte, overflowX: "auto" };
export const tableau = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
export const th = {
  padding: "10px 12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", backgroundColor: "var(--surface-raised)",
};
export const thNum = { ...th, textAlign: "right" };
export const td = { padding: "10px 12px", color: "var(--text-2)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
export const tdNum = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
