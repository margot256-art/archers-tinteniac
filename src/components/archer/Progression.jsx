import { useState } from "react";
import { PRIMARY } from "../../utils/seances";
import Totaux from "./progression/Totaux";
import Courbes from "./progression/Courbes";

export default function Progression() {
  const [vue, setVue] = useState("totaux");

  return (
    <div style={s.page}>
      <div style={s.toggle} role="tablist" aria-label="Vue">
        <button
          role="tab" aria-selected={vue === "totaux"}
          style={{ ...s.toggleBtn, ...(vue === "totaux" ? s.toggleBtnActif : {}) }}
          onClick={() => setVue("totaux")}
        >
          Totaux
        </button>
        <button
          role="tab" aria-selected={vue === "courbes"}
          style={{ ...s.toggleBtn, ...(vue === "courbes" ? s.toggleBtnActif : {}) }}
          onClick={() => setVue("courbes")}
        >
          Courbes
        </button>
      </div>

      {vue === "totaux" ? <Totaux /> : <Courbes />}
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "18px" },
  toggle: {
    display: "inline-flex", alignSelf: "flex-start", gap: "4px",
    backgroundColor: "var(--surface-raised)", borderRadius: "10px", padding: "4px",
  },
  toggleBtn: {
    background: "none", border: "none", borderRadius: "7px",
    padding: "8px 18px", fontSize: "13px", fontWeight: "600",
    color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
  },
  toggleBtnActif: {
    backgroundColor: "var(--surface)", color: PRIMARY,
    boxShadow: "var(--shadow-card)",
  },
};
