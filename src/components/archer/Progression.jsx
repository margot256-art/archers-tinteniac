import { useState } from "react";
import Totaux from "./progression/Totaux";
import Courbes from "./progression/Courbes";
import * as ui from "./styleArcher";

export default function Progression() {
  const [vue, setVue] = useState("totaux");

  return (
    <div style={ui.page}>
      <div style={{ ...ui.bascule, alignSelf: "flex-start" }} role="tablist" aria-label="Vue">
        {[["totaux", "Totaux"], ["courbes", "Courbes"]].map(([id, label]) => (
          <button
            key={id} role="tab" aria-selected={vue === id}
            style={{ ...ui.basculeBtn, ...(vue === id ? ui.basculeBtnActif : {}) }}
            onClick={() => setVue(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {vue === "totaux" ? <Totaux /> : <Courbes />}
    </div>
  );
}
