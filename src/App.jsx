import { useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/auth/LoginScreen";
import Layout from "./components/Layout";

function App() {
  const { user, isCoach, login, logout } = useAuth();

  if (!user) {
    return <LoginScreen login={login} onLogin={() => {}} />;
  }

  return <Layout user={user} isCoach={isCoach} onLogout={logout} />;
}

export default App;
