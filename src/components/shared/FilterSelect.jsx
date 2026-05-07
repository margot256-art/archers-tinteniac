export default function FilterSelect({ label, value, options, onChange, className = "coach-filter-select" }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{
        fontSize: "12px", fontWeight: "600", color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <select value={value} onChange={e => onChange(e.target.value)} className={className}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
