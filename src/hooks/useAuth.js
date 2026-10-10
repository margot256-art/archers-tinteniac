import { useSyncExternalStore } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { slug } from "../utils/slug";

const DOMAIN = "@archers-tinteniac.fr";

// Profil de la personne connectée, gardé sur l'appareil : l'appli s'ouvre tout de
// suite, et reste utilisable sans réseau (au pas de tir) même si le profil ne peut
// pas être relu depuis Firestore.
const CLE_PROFIL = "archers-tinteniac.profil";

function lireProfil(uid) {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_PROFIL));
    return p?.id === uid ? p : null;
  } catch { return null; }
}
function ecrireProfil(profil) {
  try { localStorage.setItem(CLE_PROFIL, JSON.stringify(profil)); } catch { /* stockage indisponible */ }
}
function effacerProfil() {
  try { localStorage.removeItem(CLE_PROFIL); } catch { /* stockage indisponible */ }
}

// Anciennes clés de l'authentification maison (avant Firebase Authentication).
try { localStorage.removeItem("at_user"); localStorage.removeItem("at_coach"); } catch { /* stockage indisponible */ }

// ── État partagé par toute l'appli : une seule écoute de Firebase Auth ────────
let etat = { user: null, isCoach: false, initializing: true };
const abonnes = new Set();
const publier = (nouvel) => { etat = nouvel; abonnes.forEach((f) => f()); };
const sAbonner = (f) => { abonnes.add(f); return () => abonnes.delete(f); };
const lireEtat = () => etat;

onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) {
    effacerProfil();
    publier({ user: null, isCoach: false, initializing: false });
    return;
  }

  const enCache = lireProfil(fbUser.uid);
  if (enCache) publier({ user: enCache, isCoach: enCache.role === "coach", initializing: false });

  try {
    const [tokenResult, snap] = await Promise.all([
      getIdTokenResult(fbUser),
      getDoc(doc(db, "users", fbUser.uid)),
    ]);
    const coach = tokenResult.claims.coach === true;
    const data  = snap.exists() ? snap.data() : {};
    const profil = {
      id:     fbUser.uid,
      prenom: data.prenom ?? "",
      nom:    data.nom ?? "",
      role:   coach ? "coach" : "archer",
    };
    ecrireProfil(profil);
    publier({ user: profil, isCoach: coach, initializing: false });
  } catch (err) {
    // Hors ligne sans profil en cache : on garde la personne connectée avec son
    // identifiant (ses séances restent accessibles), le nom reviendra avec le réseau.
    console.error("[useAuth] erreur chargement profil :", err);
    if (!enCache) {
      publier({ user: { id: fbUser.uid, prenom: "", nom: "", role: "archer" }, isCoach: false, initializing: false });
    }
  }
});

async function login(prenom, nom, password) {
  const email = `${slug(prenom, nom)}${DOMAIN}`;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (err) {
    if (
      err.code === "auth/invalid-credential" ||
      err.code === "auth/user-not-found" ||
      err.code === "auth/wrong-password" ||
      err.code === "auth/invalid-email"
    ) {
      return { success: false, error: "Prénom, nom ou mot de passe incorrect." };
    }
    if (err.code === "auth/network-request-failed") {
      return { success: false, error: "Pas de réseau : la première connexion demande Internet." };
    }
    if (err.code === "auth/too-many-requests") {
      return { success: false, error: "Trop d'essais. Patientez quelques minutes avant de réessayer." };
    }
    console.error("[useAuth] erreur connexion :", err);
    return { success: false, error: "Erreur de connexion. Réessayez." };
  }
}

const logout = () => signOut(auth);

async function changePassword(currentPassword, newPassword) {
  const fbUser = auth.currentUser;
  if (!fbUser) return { success: false, error: "Non connecté." };
  try {
    const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
    await reauthenticateWithCredential(fbUser, credential);
    await updatePassword(fbUser, newPassword);
    return { success: true };
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      return { success: false, error: "Mot de passe actuel incorrect." };
    }
    if (err.code === "auth/weak-password") {
      return { success: false, error: "Le nouveau mot de passe doit faire au moins 6 caractères." };
    }
    console.error("[useAuth] erreur changement mot de passe :", err);
    return { success: false, error: "Erreur lors de la mise à jour. Réessayez." };
  }
}

export function useAuth() {
  const { user, isCoach, initializing } = useSyncExternalStore(sAbonner, lireEtat);
  return { user, isCoach, initializing, login, logout, changePassword };
}
