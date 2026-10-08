// Styles partagés par tous les écrans de saisie d'exercice (direction « Blason »).
import { PRIMARY as PINK } from "../../../utils/seances";

export { PINK };

export const exerciceStyles = {
  page: {
    backgroundColor: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)", padding: "24px",
    display: "flex", flexDirection: "column", gap: "18px",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: "var(--display)", fontSize: "19px", fontWeight: "600", color: "var(--text)", margin: 0 },
  annulerBtn: {
    background: "none", border: "1px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "7px", padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
  },
  resume: { fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 },

  label: {
    fontSize: "11px", fontWeight: "600", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  input: {
    padding: "10px 12px", border: "1.5px solid var(--border-2)", borderRadius: "9px",
    fontSize: "14px", color: "var(--text)", outline: "none",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)",
    width: "100%", boxSizing: "border-box",
  },

  compteurBox: {
    position: "relative", overflow: "hidden",
    backgroundColor: "var(--surface-raised)", borderRadius: "14px",
    border: "1px solid var(--border)", padding: "22px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
  },
  compteurTotal: {
    fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums",
    fontSize: "40px", fontWeight: "700", color: PINK, lineHeight: 1, letterSpacing: "-0.01em",
  },
  compteurLabel: { fontSize: "13px", color: "var(--text-muted)" },

  voleeEnCoursBox: {
    display: "flex", flexDirection: "column", gap: "12px",
    border: "1px solid var(--border)", borderRadius: "14px", padding: "18px",
  },
  voleeEnCoursHead: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: "11px", fontWeight: "700", color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  miniBtn: {
    background: "none", border: "1px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "6px", padding: "3px 9px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit",
  },
  recap: { display: "flex", gap: "8px", flexWrap: "wrap" },
  recapItem: {
    fontFamily: "var(--mono)", fontSize: "12px", fontWeight: "700", color: PINK,
    backgroundColor: "var(--pink-soft)", borderRadius: "7px", padding: "4px 9px",
  },
  recapItemOff: { color: "var(--text-dim)", backgroundColor: "var(--surface-sub)", textDecoration: "line-through" },

  validerBtn: {
    backgroundColor: PINK, color: "#fff", border: "none",
    borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },

  actions: { display: "flex", gap: "10px", alignItems: "stretch" },
  voleeBtn: {
    flex: 1, backgroundColor: PINK, color: "#fff", border: "none",
    borderRadius: "12px", padding: "17px", fontSize: "16px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
  corrigerBtn: {
    width: "56px", background: "none", border: "1.5px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "12px", fontSize: "17px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
  },
  corrigerBtnOff: { opacity: 0.35, cursor: "not-allowed" },

  journal: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  journalItem: {
    fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)",
    backgroundColor: "var(--surface-sub)", border: "1px solid var(--border)",
    borderRadius: "7px", padding: "4px 9px",
  },

  msgError: {
    backgroundColor: "var(--pink-soft)", border: `1px solid ${PINK}`, borderRadius: "9px",
    padding: "10px 14px", fontSize: "13px", color: PINK,
  },
  terminerBtn: {
    backgroundColor: "var(--good)", color: "#fff", border: "none",
    borderRadius: "11px", padding: "15px", fontSize: "15px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
};
