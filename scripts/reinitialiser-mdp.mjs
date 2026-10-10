// Remet un mot de passe provisoire sur un compte Firebase Authentication et
// l'affiche, à transmettre à la personne (elle pourra le changer avec 🔑).
//
// Usage (sans --apply : simulation, rien n'est modifié) :
//   node scripts/reinitialiser-mdp.mjs --id=prenom_nom
//   node scripts/reinitialiser-mdp.mjs --id=prenom_nom --apply
//
// Nécessite serviceAccount.json à la racine du projet (jamais dans le dépôt).
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { randomInt } from "crypto";

const args  = process.argv.slice(2);
const id    = args.find((a) => a.startsWith("--id="))?.slice(5).trim();
const APPLY = args.includes("--apply");

if (!id) {
  console.error("Usage : node scripts/reinitialiser-mdp.mjs --id=prenom_nom [--apply]");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL("../serviceAccount.json", import.meta.url), "utf8"))) });
const auth = getAuth();

const compte = await auth.getUser(id).catch((err) => {
  console.error(err.code === "auth/user-not-found" ? `Aucun compte "${id}".` : err.message);
  process.exit(1);
});

if (!APPLY) {
  console.log(`[simulation] ${id} (${compte.email}) : un mot de passe provisoire sera défini.`);
  console.log("Relancer avec --apply pour le définir.");
  process.exit(0);
}

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const motDePasse = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
await auth.updateUser(id, { password: motDePasse });
console.log(`${id} (${compte.email}) : mot de passe provisoire = ${motDePasse}`);
process.exit(0);
