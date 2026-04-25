import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";

const PRIMARY = "#FF007A";
const DISTANCES = ["5m", "18m", "20m", "30m", "40m", "50m", "60m", "70m"];

const todayISO = () => new Date().toISOString().split("T")[0];

const INIT = {
  date: todayISO(),
  distance: "18m",
  type: "Entraînement",
  lieu: "",
  volumePaille: "",
  volumeBlason: "",
  volumeCompte: "",
  score: "",
};

export default function Saisie() {
  const { user } = useAuth();
  const [form, setForm] = useState(INIT);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSuccess(false);
    setError("");
  };

  const paille  = parseInt(form.volumePaille) || 0;
  const blason  = parseInt(form.volumeBlason) || 0;
  const compte  = parseInt(form.volumeCompte) || 0;
  const score   = parseInt(form.score) || 0;
  const totalFleches = paille + blason + compte;
  const moyenne = compte > 0 ? (score / compte).toFixed(2) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await addDoc(collection(db, "seances"), {
        archer:        `${user.prenom} ${user.nom}`,
        archerId:      user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`,
        date:          form.date,
        distance:      form.distance,
        type:          form.type,
        lieu:          form.lieu.trim() || null,
        volumePaille:  paille,
        volumeBlason:  blason,
        volumeCompte:  compte,
        score,
        totalFleches,
        moyenne:       moyenne !== null ? parseFloat(moyenne) : null,
        createdAt:     serverTimestamp(),
      });
      setSuccess(true);
      setForm((prev) => ({
        ...INIT,
        date:     prev.date,
        distance: prev.distance,
        type:     prev.type,
      }));
    } catch (err) {
      console.error("[Saisie] erreur Firestore :", err);
      setError("Erreur lors de l'enregistrement. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <h2 style={s.title}>Nouvelle séance</h2>

      <form onSubmit={handleSubmit} style={s.card}>

        {/* Date + Distance */}
        <div style={s.row2}>
          <Field label="Date">
            <input type="date" value={form.date} onChange={set("date")}
              style={s.input} required />
          </Field>
          <Field label="Distance">
            <select value={form.distance} onChange={set("distance")} style={s.input}>
              {DISTANCES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
        </div>

        {/* Type + Lieu */}
        <div style={s.row2}>
          <Field label="Type de séance">
            <select value={form.type} onChange={set("type")} style={s.input}>
              <option>Entraînement</option>
              <option>Compétition</option>
            </select>
          </Field>
          <Field label="Lieu (optionnel)">
            <input type="text" value={form.lieu} onChange={set("lieu")}
              style={s.input} placeholder="ex : Salle Tinténiac" />
          </Field>
        </div>

        <div style={s.divider} />

        {/* Volumes */}
        <div style={s.row3}>
          <Field label="Vol. paille">
            <input type="number" min="0" value={form.volumePaille}
              onChange={set("volumePaille")} style={s.input} placeholder="0" />
          </Field>
          <Field label="Vol. blason">
            <input type="number" min="0" value={form.volumeBlason}
              onChange={set("volumeBlason")} style={s.input} placeholder="0" />
          </Field>
          <Field label="Vol. tir compté">
            <input type="number" min="0" value={form.volumeCompte}
              onChange={set("volumeCompte")} style={s.input} placeholder="0" />
          </Field>
        </div>

        {/* Score */}
        <div style={{ maxWidth: "200px" }}>
          <Field label="Score">
            <input type="number" min="0" value={form.score}
              onChange={set("score")} style={s.input} placeholder="0" />
          </Field>
        </div>

        {/* Résumé calculé */}
        <div style={s.summary}>
          <SummaryItem label="Total flèches" value={totalFleches || "—"} />
          <div style={s.sep} />
          <SummaryItem
            label="Moyenne / flèche comptée"
            value={moyenne ?? "—"}
            accent={moyenne !== null}
          />
        </div>

        {error   && <div style={s.msgError}>{error}</div>}
        {success && <div style={s.msgSuccess}>✓ Séance enregistrée avec succès !</div>}

        <button
          type="submit"
          disabled={loading}
          style={{ ...s.btn, ...(loading ? s.btnOff : {}) }}
        >
          {loading ? "Enregistrement…" : "Enregistrer la séance"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function SummaryItem({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "26px", fontWeight: "700", color: accent ? PRIMARY : "#333" }}>
        {value}
      </div>
    </div>
  );
}

const s = {
  page:  { maxWidth: "620px", margin: "0 auto" },
  title: { fontSize: "20px", fontWeight: "700", color: "#111", margin: "0 0 20px" },
  card:  {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" },
  label: {
    fontSize: "11px", fontWeight: "600", color: "#666",
    textTransform: "uppercase", letterSpacing: "0.07em",
  },
  input: {
    padding: "10px 12px",
    border: "1.5px solid #e8e8e8",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#111",
    outline: "none",
    fontFamily: "inherit",
    backgroundColor: "#fafafa",
    width: "100%",
    boxSizing: "border-box",
  },
  divider: { height: "1px", backgroundColor: "#f0f0f0" },
  summary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#f9f9f9",
    borderRadius: "10px",
    padding: "20px",
    border: "1px solid #efefef",
  },
  sep:    { width: "1px", height: "44px", backgroundColor: "#e0e0e0" },
  msgError: {
    backgroundColor: "#fff0f5", border: `1px solid ${PRIMARY}`,
    borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: PRIMARY,
  },
  msgSuccess: {
    backgroundColor: "#f0fff4", border: "1px solid #66bb6a",
    borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
    color: "#2e7d32", fontWeight: "500",
  },
  btn: {
    padding: "13px", backgroundColor: PRIMARY, color: "#fff",
    border: "none", borderRadius: "8px", fontSize: "15px",
    fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnOff: { opacity: 0.6, cursor: "not-allowed" },
};
