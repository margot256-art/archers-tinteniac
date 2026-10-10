import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { requireCoach, jsonResponse } from "./_admin.mjs";
import { slug } from "../../src/utils/slug.js";

const MIN_PWD_LEN = 6;
const DOMAIN      = "@archers-tinteniac.fr";

const normAp  = (s) => s.replace(/['`´ʼ'ʹ]/g, "'");
const toDocId = (prenom, nom) =>
  normAp(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`).replace(/\s+/g, "_");

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Méthode non autorisée." });
  }

  const auth = await requireCoach(event);
  if (auth.error) return auth.error;

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "JSON invalide." });
  }

  const { prenom, nom, password } = payload;
  if (!prenom?.trim() || !nom?.trim()) {
    return jsonResponse(400, { error: "Prénom et nom requis." });
  }
  if (!password || password.length < MIN_PWD_LEN) {
    return jsonResponse(400, { error: `Mot de passe trop court (${MIN_PWD_LEN} caractères min).` });
  }

  const docId = toDocId(prenom, nom);
  const email = `${slug(prenom, nom)}${DOMAIN}`;
  const db    = getFirestore(auth.app);
  const authInst = getAuth(auth.app);

  const existing = await db.collection("users").doc(docId).get();
  if (existing.exists) {
    return jsonResponse(409, { error: `Un archer "${prenom.trim()} ${nom.trim()}" existe déjà.` });
  }

  try {
    await authInst.createUser({ uid: docId, email, password });
    await db.collection("users").doc(docId).set({
      prenom:   prenom.trim(),
      nom:      nom.trim(),
      loginKey: slug(prenom, nom),
    });
    return jsonResponse(200, { success: true, id: docId });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
