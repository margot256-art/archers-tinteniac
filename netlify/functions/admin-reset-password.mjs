import { getAuth } from "firebase-admin/auth";
import { requireCoach, jsonResponse } from "./_admin.mjs";

const MIN_PWD_LEN = 6;

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

  const { uid, password } = payload;
  if (!uid || !password) {
    return jsonResponse(400, { error: "uid et password requis." });
  }
  if (password.length < MIN_PWD_LEN) {
    return jsonResponse(400, { error: `Mot de passe trop court (${MIN_PWD_LEN} caractères min).` });
  }

  try {
    await getAuth(auth.app).updateUser(uid, { password });
    return jsonResponse(200, { success: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
