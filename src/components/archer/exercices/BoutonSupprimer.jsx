import { useState } from "react";

// Bouton de suppression à double confirmation, utilisé par tous les écrans
// d'exercice en mode édition.
export default function BoutonSupprimer({ onConfirm, disabled, label = "l'exercice" }) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div style={s.row}>
        <span style={s.texte}>Supprimer définitivement ?</span>
        <button type="button" style={s.oui} onClick={onConfirm} disabled={disabled}>Oui</button>
        <button type="button" style={s.non} onClick={() => setConfirm(false)} disabled={disabled}>Non</button>
      </div>
    );
  }

  return (
    <button type="button" style={s.supprimer} onClick={() => setConfirm(true)} disabled={disabled}>
      🗑 Supprimer {label}
    </button>
  );
}

const s = {
  row: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" },
  texte: { color: "var(--text-muted)" },
  oui: {
    backgroundColor: "var(--bad)", color: "#fff", border: "none",
    borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: "700",
    cursor: "pointer", fontFamily: "inherit",
  },
  non: {
    background: "none", border: "1px solid var(--border-3)", color: "var(--text-muted)",
    borderRadius: "6px", padding: "6px 12px", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit",
  },
  supprimer: {
    background: "none", border: "1px solid var(--bad)", color: "var(--bad)",
    borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: "600",
    cursor: "pointer", fontFamily: "inherit",
  },
};
