// Migration des comptes Firestore "users" (mdp en base64) vers Firebase Authentication.
//
// Étape 1 — création des comptes (avant la mise en prod de la nouvelle version) :
//   pour chaque document de "users" sans compte Firebase Auth :
//   - crée le compte avec uid = id du document (inchangé, pour garder les archerId
//     des séances), email = slug ASCII + "@archers-tinteniac.fr", et le même mot
//     de passe qu'avant (décodage base64 du champ `mdp`) ;
//   - mot de passe trop court pour Firebase Auth (< 6 caractères) : mot de passe
//     provisoire, affiché dans le rapport, à transmettre à l'archer ;
//   - range prénom/nom dans leurs champs (anciens docs : nom complet dans `nom`) et
//     ajoute `loginKey` (= le slug) ;
//   - coachs (ids passés via --coaches) : custom claim { coach: true }.
//   Le champ `mdp` est GARDÉ : la version en prod s'en sert encore pour se connecter.
//   Relançable sans risque : un compte déjà créé n'est pas recréé.
//
// Étape 2 — après la mise en prod : --supprimer-anciens-mdp efface les champs `mdp`
//   des comptes qui ont bien leur compte Firebase Auth.
//
// Usage (sans --apply : simulation, rien n'est modifié) :
//   node scripts/migrate-auth.mjs --coaches=prenom_nom,autre_coach
//   node scripts/migrate-auth.mjs --coaches=prenom_nom,autre_coach --apply
//   node scripts/migrate-auth.mjs --supprimer-anciens-mdp
//   node scripts/migrate-auth.mjs --supprimer-anciens-mdp --apply
//
// Nécessite serviceAccount.json à la racine du projet (clé de compte de service
// Firebase Admin — jamais dans le dépôt, voir .gitignore).

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { randomInt } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { slug } from "../src/utils/slug.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args       = process.argv.slice(2);
const APPLY      = args.includes("--apply");
const NETTOYAGE  = args.includes("--supprimer-anciens-mdp");
const coachArg   = args.find((a) => a.startsWith("--coaches="));
const COACH_IDS  = new Set(
  coachArg
    ? coachArg.slice("--coaches=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : []
);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "../serviceAccount.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const db   = getFirestore();
const auth = getAuth();

const DOMAIN      = "@archers-tinteniac.fr";
const MIN_PWD_LEN = 6; // minimum imposé par Firebase Auth

// Mot de passe provisoire lisible (pas de 0/O ni 1/l) : 8 caractères.
function motDePasseProvisoire() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function decodePassword(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}

// Anciens documents : nom complet stocké dans `nom` seul.
function resolveNames(id, data) {
  if (data.prenom) return { prenom: data.prenom.trim(), nom: (data.nom || "").trim() };
  if (data.nom) {
    const parts = data.nom.trim().split(/\s+/);
    return { prenom: parts[0] ?? "", nom: parts.slice(1).join(" ") };
  }
  const parts = id.split("_");
  return { prenom: parts[0] ?? id, nom: parts.slice(1).join(" ") };
}

async function compteExiste(uid) {
  try {
    await auth.getUser(uid);
    return true;
  } catch (err) {
    if (err.code === "auth/user-not-found") return false;
    throw err;
  }
}

async function creerComptes(docs) {
  const report = { crees: [], deja: [], erreurs: [], provisoires: [] };

  for (const id of COACH_IDS) {
    if (!docs.some((d) => d.id === id)) {
      report.erreurs.push({ id, reason: "coach demandé mais aucun compte \"users\" avec cet identifiant" });
    }
  }

  for (const docSnap of docs) {
    const id      = docSnap.id;
    const data    = docSnap.data();
    const isCoach = COACH_IDS.has(id);

    try {
      if (await compteExiste(id)) {
        if (isCoach && APPLY) await auth.setCustomUserClaims(id, { coach: true });
        console.log(`  = ${id} : compte déjà créé${isCoach ? "  [coach]" : ""}`);
        report.deja.push(id);
        continue;
      }

      if (!data.mdp) {
        report.erreurs.push({ id, reason: "pas de compte Firebase Auth et pas de champ mdp" });
        continue;
      }

      const { prenom, nom } = resolveNames(id, data);
      if (!prenom || !nom) {
        report.erreurs.push({ id, reason: "prénom/nom introuvable" });
        continue;
      }

      let password = decodePassword(data.mdp);
      let provisoire = null;
      if (!password || password.length < MIN_PWD_LEN) {
        provisoire = APPLY ? motDePasseProvisoire() : "(généré à l'application)";
        password = provisoire;
      }

      const loginKey = slug(prenom, nom);
      const email    = `${loginKey}${DOMAIN}`;
      console.log(`  ${APPLY ? "+" : "[simulation]"} ${id} : ${prenom} ${nom} -> ${email}${isCoach ? "  [coach]" : ""}${provisoire ? "  [mot de passe trop court → provisoire]" : ""}`);

      if (APPLY) {
        await auth.createUser({ uid: id, email, password });
        if (isCoach) await auth.setCustomUserClaims(id, { coach: true });
        await db.collection("users").doc(id).update({ prenom, nom, loginKey });
      }
      report.crees.push(id);
      if (provisoire) report.provisoires.push({ prenom, nom, provisoire });
    } catch (err) {
      report.erreurs.push({ id, reason: err.message });
    }
  }

  console.log("\n── Rapport ──────────────────────────────────────");
  console.log(`${APPLY ? "Comptes créés" : "Comptes à créer"} : ${report.crees.length}`);
  console.log(`Déjà créés : ${report.deja.length}`);
  console.log(`Erreurs : ${report.erreurs.length}`);
  if (report.provisoires.length) {
    console.log("\nMots de passe provisoires (ancien mot de passe trop court) — à transmettre :");
    report.provisoires.forEach((r) => console.log(`  - ${r.prenom} ${r.nom} : ${r.provisoire}`));
  }
  if (report.erreurs.length) {
    console.log("\nErreurs :");
    report.erreurs.forEach((r) => console.log(`  - ${r.id} : ${r.reason}`));
  }
}

async function supprimerAnciensMdp(docs) {
  let n = 0;
  for (const docSnap of docs) {
    if (!docSnap.data().mdp) continue;
    if (!(await compteExiste(docSnap.id))) {
      console.log(`  ! ${docSnap.id} : pas encore de compte Firebase Auth, mdp gardé`);
      continue;
    }
    console.log(`  ${APPLY ? "-" : "[simulation]"} ${docSnap.id} : ancien mdp effacé`);
    if (APPLY) await db.collection("users").doc(docSnap.id).update({ mdp: FieldValue.delete() });
    n++;
  }
  console.log(`\n${n} ancien(s) mot(s) de passe ${APPLY ? "effacé(s)" : "à effacer"}.`);
}

async function main() {
  const snap = await db.collection("users").get();
  console.log(`${snap.size} document(s) dans "users".`);
  console.log(APPLY ? "Mode : --apply (modifications réelles)\n" : "Mode : simulation (aucune modification)\n");

  if (NETTOYAGE) await supprimerAnciensMdp(snap.docs);
  else await creerComptes(snap.docs);

  if (!APPLY) console.log("\nSimulation — rien n'a été modifié. Relancer avec --apply pour exécuter.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
