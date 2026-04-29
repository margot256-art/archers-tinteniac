import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COACH_PASSWORD = "ArchersTinté2026";
const USER_KEY  = "at_user";
const COACH_KEY = "at_coach";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

function clearStorage() {
  try { localStorage.removeItem(USER_KEY);  } catch {}
  try { localStorage.removeItem(COACH_KEY); } catch {}
}

function loadStoredUser() {
  try {
    const raw       = localStorage.getItem(USER_KEY);
    const coachFlag = localStorage.getItem(COACH_KEY);
    if (!raw) return null;

    // Try JSON first (for sessions written by this app after login)
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.prenom && parsed.nom) {
        return {
          prenom: parsed.prenom,
          nom:    parsed.nom,
          id:     parsed.id ?? `${parsed.prenom.trim().toLowerCase()}_${parsed.nom.trim().toLowerCase()}`,
          role:   parsed.role ?? (coachFlag === "true" ? "coach" : "archer"),
        };
      }
    } catch {
      // not JSON — fall through to plain-string handling
    }

    // Plain string: "Margot TREVILLY"
    const parts  = raw.trim().split(/\s+/);
    const prenom = parts[0] ?? "";
    const nom    = parts.slice(1).join(" ");

    if (!prenom || !nom) {
      // unrecognisable value — wipe and show login
      clearStorage();
      return null;
    }

    const id = `${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`;
    return { prenom, nom, id, role: coachFlag === "true" ? "coach" : "archer" };
  } catch {
    clearStorage();
    return null;
  }
}

export function useAuth() {
  const [user,    setUser]    = useState(loadStoredUser);
  const [isCoach, setIsCoach] = useState(() => {
    try { return localStorage.getItem(COACH_KEY) === "true"; } catch { return false; }
  });

  const login = async (prenom, nom, password) => {
    console.log("[useAuth] login appelé :", { prenom, nom });

    if (password === COACH_PASSWORD) {
      console.log("[useAuth] mot de passe coach reconnu");
      const coachUser = { prenom, nom, role: "coach", id: `${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}` };
      try { localStorage.setItem(COACH_KEY, "true"); localStorage.setItem(USER_KEY, `${prenom} ${nom}`); } catch {}
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

      const data    = snapshot.data();
      const encoded = toBase64(password);
      console.log("[useAuth] mdp stocké :", data.mdp);
      console.log("[useAuth] mdp encodé saisi :", encoded);

      if (data.mdp !== encoded) {
        return { success: false, error: "Mot de passe incorrect." };
      }

      const userData = { prenom, nom, role: "archer", id: docId };
      try { localStorage.setItem(USER_KEY, `${prenom} ${nom}`); localStorage.removeItem(COACH_KEY); } catch {}
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
    clearStorage();
    setUser(null);
    setIsCoach(false);
  };

  return { user, isCoach, login, logout };
}
