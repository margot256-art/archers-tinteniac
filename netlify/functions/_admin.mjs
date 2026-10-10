// Utilitaires partagés par les fonctions admin (vérification du token + claim coach).
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export function adminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

export function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// Vérifie le token Firebase du header Authorization et exige le custom claim coach.
// Retourne { app, decoded } si OK, ou { error: <réponse HTTP> } sinon.
export async function requireCoach(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { error: jsonResponse(401, { error: "Token manquant." }) };
  }

  const app = adminApp();
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(match[1]);
  } catch {
    return { error: jsonResponse(401, { error: "Token invalide." }) };
  }

  if (decoded.coach !== true) {
    return { error: jsonResponse(403, { error: "Accès réservé au coach." }) };
  }

  return { app, decoded };
}
