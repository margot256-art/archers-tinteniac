// Suppression du compte d'un archer, réservée aux coachs.
// POST { uid } → supprime le compte de connexion (Firebase Auth), la fiche
// `users/{uid}`, ses objectifs et ses demandes de mot de passe.
// Les séances sont CONSERVÉES : elles restent dans l'historique du club (journal
// et statistiques du coach).
// Refusé pour son propre compte et pour un coach (retirer d'abord le droit coach).
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { requireCoach, jsonResponse } from "./_admin.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const verif = await requireCoach(event);
  if (verif.error) return verif.error;

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "JSON invalide." });
  }

  const { uid } = payload;
  if (!uid) return jsonResponse(400, { error: "uid requis." });
  if (uid === verif.decoded.uid) {
    return jsonResponse(400, { error: "Vous ne pouvez pas supprimer votre propre compte." });
  }

  const auth = getAuth(verif.app);
  const db   = getFirestore(verif.app);

  try {
    const compte = await auth.getUser(uid).catch((err) => {
      if (err.code === "auth/user-not-found") return null;
      throw err;
    });
    if (compte?.customClaims?.coach === true) {
      return jsonResponse(400, { error: "C'est un coach : retirez d'abord son droit coach." });
    }

    if (compte) await auth.deleteUser(uid);

    const batch = db.batch();
    batch.delete(db.doc(`users/${uid}`));
    batch.delete(db.doc(`objectifs/${uid}`));
    const demandes = await db.collection("password_resets").where("archerId", "==", uid).get();
    demandes.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    return jsonResponse(200, { success: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
