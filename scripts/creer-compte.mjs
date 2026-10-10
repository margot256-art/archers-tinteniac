// Crée un compte (archer ou coach) directement dans Firebase Authentication +
// "users", avec un mot de passe provisoire affiché, à transmettre à la personne
// (elle pourra le changer avec 🔑 une fois connectée).
// Sert surtout à créer un coach : la création d'archer depuis le tableau de bord
// exige déjà un coach connecté.
//
// Usage (sans --apply : simulation, rien n'est créé) :
//   node scripts/creer-compte.mjs --prenom=Matthieu --nom=GICQUEL --coach
//   node scripts/creer-compte.mjs --prenom=Matthieu --nom=GICQUEL --coach --apply
//
// Nécessite serviceAccount.json à la racine du projet (jamais dans le dépôt).
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { randomInt } from "crypto";
import { slug } from "../src/utils/slug.js";

const args  = process.argv.slice(2);
const arg   = (nom) => args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3).trim();
const APPLY = args.includes("--apply");
const COACH = args.includes("--coach");
const prenom = arg("prenom");
const nom    = arg("nom");

if (!prenom || !nom) {
  console.error("Usage : node scripts/creer-compte.mjs --prenom=Prénom --nom=NOM [--coach] [--apply]");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL("../serviceAccount.json", import.meta.url), "utf8"))) });
const auth = getAuth();
const db   = getFirestore();

// Même identifiant que les comptes existants (voir toDocId dans le tableau de bord coach).
const normAp = (s) => s.replace(/['`´ʼ'ʹ]/g, "'");
const uid    = normAp(`${prenom.toLowerCase()}_${nom.toLowerCase()}`).replace(/\s+/g, "_");
const loginKey = slug(prenom, nom);
const email    = `${loginKey}@archers-tinteniac.fr`;

const existeDeja = await auth.getUser(uid).then(() => true, (err) => {
  if (err.code === "auth/user-not-found") return false;
  throw err;
});
if (existeDeja || (await db.collection("users").doc(uid).get()).exists) {
  console.error(`Un compte "${uid}" existe déjà : rien n'est créé.`);
  process.exit(1);
}

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const motDePasse = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");

console.log(`${APPLY ? "Création" : "[simulation]"} : ${prenom} ${nom} -> ${email} (id ${uid})${COACH ? "  [coach]" : ""}`);
if (APPLY) {
  await auth.createUser({ uid, email, password: motDePasse });
  if (COACH) await auth.setCustomUserClaims(uid, { coach: true });
  await db.collection("users").doc(uid).set({ prenom, nom, loginKey });
  console.log(`Compte créé. Mot de passe provisoire à transmettre : ${motDePasse}`);
} else {
  console.log("Simulation — rien n'a été créé. Relancer avec --apply pour créer le compte.");
}
process.exit(0);
