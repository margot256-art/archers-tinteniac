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
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);

  if (!user) {
    return <LoginScreen login={login} onLogin={() => {}} theme={theme} toggleTheme={toggleTheme} />;
  }

  return <Layout user={user} isCoach={isCoach} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />;
}

export default App;
