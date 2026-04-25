import { useAuth } from "./hooks/useAuth";
import LoginScreen from "./components/auth/LoginScreen";
import Layout from "./components/Layout";
import Saisie from "./components/archer/Saisie";

function App() {
  const { user, isCoach, login, logout } = useAuth();

  if (!user) {
    return <LoginScreen login={login} onLogin={() => {}} />;
  }

  return (
    <Layout user={user} isCoach={isCoach} onLogout={logout}>
      {(activeTab) => {
        if (activeTab === "new-session") return <Saisie />;
        return (
          <div style={{
            backgroundColor: "#fff", borderRadius: "10px",
            padding: "48px", textAlign: "center", color: "#aaa", fontSize: "14px",
          }}>
            Vue <strong style={{ color: "#333" }}>{activeTab}</strong> — à venir
          </div>
        );
      }}
    </Layout>
  );
}

export default App;
