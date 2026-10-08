import { PINK } from "./exerciceStyles";
import { ZONES } from "../../../utils/blason";

// Pavé de zones réutilisable (saisie "au clavier") pour Test 100, Potentiel Max et Zone.
export default function ZoneButtons({ onPress, disabled }) {
  return (
    <div style={s.grid}>
      {ZONES.map((z) => (
        <button key={z} type="button" style={s.btn} onClick={() => onPress(z)} disabled={disabled}>
          {z}
        </button>
      ))}
    </div>
  );
}

const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" },
  btn: {
    padding: "14px 0", borderRadius: "8px", border: `1.5px solid ${PINK}55`,
    backgroundColor: "var(--surface-raised)", color: "var(--text)",
    fontSize: "15px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit",
  },
};
