import { ZONES } from "../../../utils/blason";

// Couleurs réelles du blason (mêmes teintes que CibleSaisie.jsx) : littérales,
// un blason ne se réinterprète pas selon le thème de l'app.
const COULEURS = {
  X:    { bg: "#f2c84b", text: "#1a1a1a" },
  "10": { bg: "#f2c84b", text: "#1a1a1a" },
  "9":  { bg: "#f2c84b", text: "#1a1a1a" },
  "8":  { bg: "#d6342f", text: "#fff" },
  "7":  { bg: "#d6342f", text: "#fff" },
  "6":  { bg: "#4fa8d8", text: "#fff" },
  "5":  { bg: "#4fa8d8", text: "#fff" },
  "4":  { bg: "#19191a", text: "#fff" },
  "3":  { bg: "#19191a", text: "#fff" },
  "2":  { bg: "#f3f1ea", text: "#1a1a1a" },
  "1":  { bg: "#f3f1ea", text: "#1a1a1a" },
  M:    { bg: "transparent", text: "var(--text-muted)" },
};

// Pavé de zones réutilisable (saisie "au clavier") pour Tir compté, Test 100, Potentiel Max et Zone.
export default function ZoneButtons({ onPress, disabled }) {
  return (
    <div style={s.grid}>
      {ZONES.map((z) => {
        const c = COULEURS[z];
        return (
          <button
            key={z} type="button"
            style={{
              ...s.btn,
              backgroundColor: c.bg, color: c.text,
              border: z === "M" ? "1.5px dashed var(--border-3)" : "1.5px solid rgba(0,0,0,0.3)",
              opacity: disabled ? 0.45 : 1,
            }}
            onClick={() => onPress(z)} disabled={disabled}
          >
            {z}
          </button>
        );
      })}
    </div>
  );
}

const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" },
  btn: {
    padding: "14px 0", borderRadius: "8px",
    fontSize: "15px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
  },
};
