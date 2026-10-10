import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/auth/LoginScreen";
import Layout from "./components/Layout";

function App() {
  const { user, isCoach, login, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "");
    localStorage.setItem("theme", theme);
    // Barre du haut du téléphone (navigateur ou appli installée) de la couleur de
    // l'en-tête (--surface), pour qu'elle se fonde dans l'appli.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#fffdf8" : "#1b1b20");
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  if (!user) {
    return <LoginScreen login={login} onLogin={() => {}} theme={theme} toggleTheme={toggleTheme} />;
  }

  return <Layout user={user} isCoach={isCoach} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />;
}

export default App;
