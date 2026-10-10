import { auth } from "../lib/firebase";

/**
 * Appelle une fonction Netlify d'administration (réservée aux coachs) avec le
 * jeton Firebase de la personne connectée. Sans `payload` : requête GET.
 * Les fonctions n'existent que sur le site en ligne (pas avec `npm run dev`).
 */
export async function callAdminFunction(name, payload) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Erreur serveur.");
  return body;
}
