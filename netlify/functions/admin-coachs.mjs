// Droit coach (custom claim `coach` de Firebase Auth), réservé aux coachs :
//   GET  → { coachs: [uid, …] } : les comptes qui ont le droit coach ;
//   POST { uid, coach: true|false } → nomme coach ou retire le droit.
// Un coach ne peut pas se retirer lui-même son droit (on ne se retrouve jamais
// sans coach par erreur). La personne concernée voit le changement à la
// prochaine ouverture de l'appli.
import { getAuth } from "firebase-admin/auth";
import { requireCoach, jsonResponse } from "./_admin.mjs";

export const handler = async (event) => {
  const verif = await requireCoach(event);
  if (verif.error) return verif.error;
  const auth = getAuth(verif.app);

  if (event.httpMethod === "GET") {
    const coachs = [];
    let page;
    do {
      const res = await auth.listUsers(1000, page);
      for (const u of res.users) if (u.customClaims?.coach === true) coachs.push(u.uid);
      page = res.pageToken;
    } while (page);
    return jsonResponse(200, { coachs });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "JSON invalide." });
  }

  const { uid, coach } = payload;
  if (!uid || typeof coach !== "boolean") {
    return jsonResponse(400, { error: "uid et coach (true/false) requis." });
  }
  if (!coach && uid === verif.decoded.uid) {
    return jsonResponse(400, { error: "Vous ne pouvez pas vous retirer vous-même le droit coach." });
  }

  try {
    const compte = await auth.getUser(uid);
    const claims = { ...(compte.customClaims ?? {}) };
    if (coach) claims.coach = true;
    else delete claims.coach;
    await auth.setCustomUserClaims(uid, claims);
    return jsonResponse(200, { success: true });
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return jsonResponse(404, { error: "Ce compte n'a pas encore d'accès à l'appli." });
    }
    return jsonResponse(500, { error: err.message });
  }
};
