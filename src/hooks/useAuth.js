import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COACH_PASSWORD = "ArchersTinté2026";
const USER_KEY  = "at_user";
const COACH_KEY = "at_coach";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

// Toutes les variantes d'apostrophe (droite, typographique, autres) → typographique '
const normalizeApostrophe = (s) => s.replace(/['`´ʼ‘ʹ]/g, "’");

const toDocId = (prenom, nom) =>
  normalizeApostrophe(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`);

function clearStorage() {
  try { localStorage.removeItem(USER_KEY);  } catch {}
  try { localStorage.removeItem(COACH_KEY); } catch {}
}

function loadStoredUser() {
  try {
    const raw       = localStorage.getItem(USER_KEY);
    const coachFlag = localStorage.getItem(COACH_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.prenom && parsed.nom) {
        return {
          prenom: parsed.prenom,
          nom:    parsed.nom,
          id:     parsed.id ?? toDocId(parsed.prenom, parsed.nom),
          role:   parsed.role ?? (coachFlag === "true" ? "coach" : "archer"),
        };
      }
    } catch {
      // not JSON — plain string
    }

    const parts  = raw.trim().split(/\s+/);
    const prenom = parts[0] ?? "";
    const nom    = parts.slice(1).join(" ");

    if (!prenom || !nom) { clearStorage(); return null; }

    return { prenom, nom, id: toDocId(prenom, nom), role: coachFlag === "true" ? "coach" : "archer" };
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
    if (password === COACH_PASSWORD) {
      const coachUser = { prenom, nom, role: "coach", id: toDocId(prenom, nom) };
      try { localStorage.setItem(COACH_KEY, "true"); localStorage.setItem(USER_KEY, `${prenom} ${nom}`); } catch {}
      setIsCoach(true);
      setUser(coachUser);
      return { success: true, role: "coach" };
    }

    const docId = toDocId(prenom, nom);

    try {
      const snapshot = await getDoc(doc(db, "users", docId));

      if (!snapshot.exists()) {
        return { success: false, error: "Utilisateur introuvable." };
      }

      const data    = snapshot.data();
      const encoded = toBase64(password);

      if (data.mdp !== encoded) {
        return { success: false, error: "Mot de passe incorrect." };
      }

      const userData = { prenom, nom, role: "archer", id: docId };
      try { localStorage.setItem(USER_KEY, `${prenom} ${nom}`); localStorage.removeItem(COACH_KEY); } catch {}
      setUser(userData);
      setIsCoach(false);
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
