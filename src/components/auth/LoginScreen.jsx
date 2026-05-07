import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { PRIMARY } from "../../utils/seances";

const normAp  = (s) => s.replace(/[‘`´ʼ’ʹ]/g, "’");
const toDocId = (prenom, nom) =>
  normAp(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`).replace(/\s+/g, "_");

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--app-bg)",
    fontFamily: "'Segoe UI', sans-serif",
    padding: "24px",
    boxSizing: "border-box",
  },
  card: {
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "40px 36px 32px",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "var(--shadow-modal)",
  },
  logo: {
    textAlign: "center",
    marginBottom: "28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  logoImg: {
    width: "72px",
    height: "auto",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "var(--text)",
    margin: 0,
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--text-dim)",
    margin: 0,
  },
  accent: {
    color: PRIMARY,
  },
  fieldGroup: {
    display: "flex",
    gap: "10px",
    marginBottom: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
  fieldFull: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "14px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-muted)",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  input: {
    padding: "10px 12px",
    border: "var(--border-2)",
    borderRadius: "8px",
    fontSize: "14px",
    color: "var(--text)",
    backgroundColor: "var(--input-bg)",
    outline: "none",
    transition: "border-color 0.2s",
    fontFamily: "inherit",
  },
  error: {
    backgroundColor: "rgba(255,0,122,0.1)",
    border: `1px solid ${PRIMARY}`,
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: PRIMARY,
    marginBottom: "16px",
  },
  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: PRIMARY,
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "8px",
    transition: "opacity 0.2s",
    fontFamily: "inherit",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  divider: {
    height: "1px",
    backgroundColor: "var(--border)",
    margin: "24px 0 20px",
  },
  forgotLink: {
    display: "block",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "center",
    marginTop: "14px",
    fontSize: "12px",
    color: "var(--text-dim)",
    fontFamily: "inherit",
    transition: "color 0.15s",
  },
  resetTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--text)",
    margin: "0 0 8px",
  },
  resetSubtitle: {
    fontSize: "12px",
    color: "var(--text-dim)",
    margin: "0 0 20px",
    lineHeight: "1.5",
  },
  resetSuccess: {
    backgroundColor: "rgba(22,163,74,0.12)",
    border: "1px solid #16a34a",
    borderRadius: "8px",
    padding: "12px 14px",
    fontSize: "13px",
    color: "#16a34a",
    marginBottom: "16px",
  },
  inscriptionLink: {
    display: "block",
    textAlign: "center",
    marginTop: "20px",
    fontSize: "12px",
    color: "var(--text-dim)",
    textDecoration: "none",
    transition: "color 0.15s",
  },
};

export default function LoginScreen({ login, onLogin, theme, toggleTheme }) {
  const [prenom,   setPrenom]   = useState("");
  const [nom,      setNom]      = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const [view,          setView]          = useState("login"); // "login" | "reset"
  const [resetPrenom,   setResetPrenom]   = useState("");
  const [resetNom,      setResetNom]      = useState("");
  const [resetLoading,  setResetLoading]  = useState(false);
  const [resetSuccess,  setResetSuccess]  = useState(false);
  const [resetError,    setResetError]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prenom.trim() || !nom.trim() || !password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setError("");
    setLoading(true);
    const result = await login(prenom, nom, password);
    setLoading(false);
    if (result.success) {
      onLogin?.(result.role);
    } else {
      setError(result.error);
    }
  };

  const isDisabled = loading || !prenom.trim() || !nom.trim() || !password;

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetPrenom.trim() || !resetNom.trim()) {
      setResetError("Veuillez remplir votre prénom et nom.");
      return;
    }
    setResetError("");
    setResetLoading(true);
    try {
      await addDoc(collection(db, "password_resets"), {
        prenom:      resetPrenom.trim(),
        nom:         resetNom.trim(),
        archerId:    toDocId(resetPrenom, resetNom),
        status:      "pending",
        requestedAt: serverTimestamp(),
      });
      setResetSuccess(true);
    } catch {
      setResetError("Erreur lors de l'envoi. Réessayez.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {toggleTheme && (
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          style={{
            position: "fixed", top: "14px", right: "14px",
            background: "none", border: "1px solid var(--border-3)",
            color: "var(--text-muted)", padding: "6px 8px", borderRadius: "6px",
            fontSize: "14px", cursor: "pointer", lineHeight: 1, zIndex: 10,
          }}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      )}
      <div style={styles.card}>

        <div style={styles.logo}>
          <img src="/TINTENIAC.png" alt="Logo Archers de Tinténiac" style={styles.logoImg} />
          <p style={styles.title}>
            Archers de <span style={styles.accent}>Tinténiac</span>
          </p>
          <p style={styles.subtitle}>Suivi d'entraînement</p>
        </div>

        <div style={styles.divider} />

        {view === "login" ? (
          <>
            <form onSubmit={handleSubmit}>
              <div style={styles.fieldGroup}>
                <div style={styles.field}>
                  <label htmlFor="login-prenom" style={styles.label}>Prénom</label>
                  <input
                    id="login-prenom"
                    style={styles.input}
                    className="login-input"
                    type="text"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Margot"
                    autoComplete="given-name"
                    onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-2)")}
                  />
                </div>
                <div style={styles.field}>
                  <label htmlFor="login-nom" style={styles.label}>Nom</label>
                  <input
                    id="login-nom"
                    style={styles.input}
                    className="login-input"
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Trevilly"
                    autoComplete="family-name"
                    onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-2)")}
                  />
                </div>
              </div>

              <div style={styles.fieldFull}>
                <label htmlFor="login-password" style={styles.label}>Mot de passe</label>
                <input
                  id="login-password"
                  style={styles.input}
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border-2)")}
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                style={{ ...styles.button, ...(isDisabled ? styles.buttonDisabled : {}) }}
                disabled={isDisabled}
              >
                {loading ? "Connexion…" : "Se connecter"}
              </button>
            </form>

            <button
              onClick={() => setView("reset")}
              style={styles.forgotLink}
            >
              Mot de passe oublié ?
            </button>
          </>
        ) : (
          <>
            <p style={styles.resetTitle}>Réinitialiser le mot de passe</p>
            <p style={styles.resetSubtitle}>
              Entrez votre prénom et nom. Le coach recevra votre demande et vous communiquera un nouveau mot de passe.
            </p>

            {resetSuccess ? (
              <div style={styles.resetSuccess}>
                ✓ Demande envoyée. Le coach va définir un nouveau mot de passe pour vous.
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <div style={styles.fieldGroup}>
                  <div style={styles.field}>
                    <label htmlFor="reset-prenom" style={styles.label}>Prénom</label>
                    <input
                      id="reset-prenom"
                      style={styles.input}
                      className="login-input"
                      type="text"
                      value={resetPrenom}
                      onChange={(e) => setResetPrenom(e.target.value)}
                      placeholder="Margot"
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border-2)")}
                    />
                  </div>
                  <div style={styles.field}>
                    <label htmlFor="reset-nom" style={styles.label}>Nom</label>
                    <input
                      id="reset-nom"
                      style={styles.input}
                      className="login-input"
                      type="text"
                      value={resetNom}
                      onChange={(e) => setResetNom(e.target.value)}
                      placeholder="Trevilly"
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) => (e.target.style.borderColor = "var(--border-2)")}
                    />
                  </div>
                </div>

                {resetError && <div style={styles.error}>{resetError}</div>}

                <button
                  type="submit"
                  style={{ ...styles.button, ...(resetLoading ? styles.buttonDisabled : {}) }}
                  disabled={resetLoading}
                >
                  {resetLoading ? "Envoi…" : "Envoyer la demande"}
                </button>
              </form>
            )}

            <button
              onClick={() => { setView("login"); setResetSuccess(false); setResetError(""); }}
              style={styles.forgotLink}
            >
              ← Retour à la connexion
            </button>
          </>
        )}

        <a
          href="https://www.archers-de-la-bretagne-romantique.fr/en-savoir-plus/mandat-et-inscription-130102"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.inscriptionLink}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text-dim)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
        >
          ↗ Inscription aux concours
        </a>

      </div>
    </div>
  );
}
