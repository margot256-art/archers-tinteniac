export default function FilterSelect({ label, value, options, onChange, libelle = (o) => o }) {
  return (
    <label style={s.label}>
      <span style={s.labelText}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={s.select}>
        {options.map((o) => <option key={o} value={o}>{libelle(o)}</option>)}
      </select>
    </label>
  );
}

const s = {
  label: { display: "flex", alignItems: "center", gap: "8px" },
  labelText: { fontSize: "13px", fontWeight: "600", color: "var(--text-muted)", whiteSpace: "nowrap" },
  select: {
    padding: "8px 12px", border: "1.5px solid var(--border-2)", borderRadius: "8px",
    fontSize: "13px", fontWeight: "600", color: "var(--text-2)", outline: "none",
    fontFamily: "inherit", backgroundColor: "var(--input-bg)", cursor: "pointer",
  },
};
