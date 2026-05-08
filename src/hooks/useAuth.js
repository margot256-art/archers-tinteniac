import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COACH_PASSWORD = "ArchersTinté2026";
const USER_KEY  = "at_user";
const COACH_KEY = "at_coach";

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

// Toutes les variantes d'apostrophe → apostrophe typographique '
const normAp = (s) => s.replace(/['`´ʼ'ʹ]/g, "’");

// Construit l'ID Firestore : minuscules + espaces→_ + apostrophe normalisée
const toDocId = (prenom, nom) =>
  normAp(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`).replace(/\s+/g, "_");

// Normalise le prénom/nom affiché (conserve la casse, normalise l'apostrophe)
const normName = (s) => normAp(s.trim());

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
        const prenom = normName(parsed.prenom);
        const nom    = normName(parsed.nom);
        return {
          prenom,
          nom,
          id:   parsed.id ?? toDocId(prenom, nom),
          role: parsed.role ?? (coachFlag === "true" ? "coach" : "archer"),
        };
      }
    } catch {
      // not JSON — plain string
    }

    // Plain string : "Florence Le Manac'h"
    const parts  = raw.trim().split(/\s+/);
    const prenom = normName(parts[0] ?? "");
    const nom    = normName(parts.slice(1).join(" "));

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
    // Normaliser dès l'entrée — tout le reste de l'app hérite des valeurs propres
    const p = normName(prenom);
    const n = normName(nom);

    if (password === COACH_PASSWORD) {
      const coachUser = { prenom: p, nom: n, role: "coach", id: toDocId(p, n) };
      try { localStorage.setItem(COACH_KEY, "true"); localStorage.setItem(USER_KEY, `${p} ${n}`); } catch {}
      setIsCoach(true);
      setUser(coachUser);
      return { success: true, role: "coach" };
    }

    const docId = toDocId(p, n);

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

      // Use the canonical name stored in Firestore, not what the user typed
      let canonPrenom, canonNom;
      if (data.prenom) {
        canonPrenom = normName(data.prenom);
        canonNom    = normName(data.nom);
      } else if (data.nom) {
        // Old format: full name stored in `nom`
        const parts = data.nom.trim().split(/\s+/);
        canonPrenom = normName(parts[0] ?? p);
        canonNom    = normName(parts.slice(1).join(" ") || n);
      } else {
        canonPrenom = p;
        canonNom    = n;
      }

      const userData = { prenom: canonPrenom, nom: canonNom, role: "archer", id: docId };
      try { localStorage.setItem(USER_KEY, JSON.stringify(userData)); localStorage.removeItem(COACH_KEY); } catch {}
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
