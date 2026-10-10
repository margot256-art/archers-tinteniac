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
import { doc, onSnapshot } from "firebase/firestore";
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

// Le rôle (coach ou non) vient du jeton Firebase Auth ; le nom vient de la fiche
// `users/{uid}`, suivie en continu : si elle n'a pas pu être lue (réseau faible),
// elle arrive dès que la connexion revient. Un échec de l'un n'efface pas l'autre.
let arreterFiche = null;

onAuthStateChanged(auth, async (fbUser) => {
  arreterFiche?.();
  arreterFiche = null;

  if (!fbUser) {
    effacerProfil();
    publier({ user: null, isCoach: false, initializing: false });
    return;
  }

  const enCache = lireProfil(fbUser.uid);
  let profil = enCache ?? { id: fbUser.uid, prenom: "", nom: "", role: "archer" };
  const mettreAJour = (champs) => {
    profil = { ...profil, ...champs };
    ecrireProfil(profil);
    publier({ user: profil, isCoach: profil.role === "coach", initializing: false });
  };

  // Connu sur cet appareil : affiché tout de suite, sans attendre le réseau.
  if (enCache) publier({ user: profil, isCoach: profil.role === "coach", initializing: false });

  try {
    // Jeton rafraîchi à chaque ouverture : un droit coach donné ou retiré depuis
    // la liste des archers est pris en compte sans se reconnecter. Sans réseau,
    // le jeton déjà connu suffit.
    const tokenResult = await getIdTokenResult(fbUser, true).catch(() => getIdTokenResult(fbUser));
    profil = { ...profil, role: tokenResult.claims.coach === true ? "coach" : "archer" };
  } catch (err) {
    // Hors ligne avec un jeton expiré : on garde le rôle connu sur l'appareil.
    console.error("[useAuth] lecture du rôle impossible :", err);
  }
  publier({ user: profil, isCoach: profil.role === "coach", initializing: false });
  if (profil.prenom || profil.nom) ecrireProfil(profil);

  arreterFiche = onSnapshot(
    doc(db, "users", fbUser.uid),
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      mettreAJour({ prenom: data.prenom ?? "", nom: data.nom ?? "" });
    },
    (err) => console.error("[useAuth] lecture de la fiche impossible :", err)
  );
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
