import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COACH_PASSWORD = "ArchersTinté2026";
const USER_KEY = "at_user";
const COACH_KEY = "at_coach";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

export function useAuth() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isCoach, setIsCoach] = useState(
    () => localStorage.getItem(COACH_KEY) === "true"
  );

  const login = async (prenom, nom, password) => {
    console.log("[useAuth] login appelé :", { prenom, nom });

    if (password === COACH_PASSWORD) {
      console.log("[useAuth] mot de passe coach reconnu");
      const coachUser = { prenom, nom, role: "coach" };
      localStorage.setItem(COACH_KEY, "true");
      localStorage.setItem(USER_KEY, JSON.stringify(coachUser));
      setIsCoach(true);
      setUser(coachUser);
      return { success: true, role: "coach" };
    }

    const docId = `${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`;
    console.log("[useAuth] recherche document Firestore :", docId);

    try {
      const snapshot = await getDoc(doc(db, "users", docId));
      console.log("[useAuth] document existe :", snapshot.exists());

      if (!snapshot.exists()) {
        return { success: false, error: "Utilisateur introuvable." };
      }

      const data = snapshot.data();
      const encoded = toBase64(password);
      console.log("[useAuth] mdp stocké :", data.mdp);
      console.log("[useAuth] mdp encodé saisi :", encoded);

      if (data.mdp !== encoded) {
        return { success: false, error: "Mot de passe incorrect." };
      }

      const userData = { prenom, nom, role: "archer", id: docId };
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      localStorage.removeItem(COACH_KEY);
      setUser(userData);
      setIsCoach(false);
      console.log("[useAuth] connexion archer réussie :", userData);
      return { success: true, role: "archer" };
    } catch (err) {
      console.error("[useAuth] erreur Firestore :", err);
      return { success: false, error: "Erreur de connexion. Réessayez." };
    }
  };

  const logout = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(COACH_KEY);
    setUser(null);
    setIsCoach(false);
  };

  return { user, isCoach, login, logout };
}
