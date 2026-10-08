import { ZONES, couleurZone } from "../../../utils/blason";

// Pavé de zones réutilisable (saisie "au clavier") pour Tir compté, Test 100, Potentiel Max et Zone.
export default function ZoneButtons({ onPress, disabled }) {
  return (
    <div style={s.grid}>
      {ZONES.map((z) => {
        const c = couleurZone(z);
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
