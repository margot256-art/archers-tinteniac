// Migration des comptes Firestore "users" (mdp en base64) vers Firebase Authentication.
//
// Pour chaque document de "users" :
//   - crée un compte Firebase Auth avec uid = id du document (inchangé, pour
//     garder les archerId des séances), email = slug ASCII + "@archers-tinteniac.fr",
//     password = décodage base64 du champ `mdp` (les archers gardent leur mot de passe).
//   - ajoute le champ "loginKey" (= le slug) au doc, range prénom/nom dans leurs
//     champs (anciens docs : nom complet dans `nom`), supprime le champ "mdp".
//   - mot de passe trop court pour Firebase Auth (< 6 caractères) : le compte est
//     créé avec un mot de passe provisoire, affiché dans le rapport, à transmettre
//     à l'archer (qui pourra le changer avec 🔑 une fois connecté).
//   - pour les coachs (docIds passés via --coaches), ajoute le custom claim { coach: true }.
//
// Usage :
//   node scripts/migrate-auth.mjs                               (dry-run, par défaut)
//   node scripts/migrate-auth.mjs --apply
//   node scripts/migrate-auth.mjs --apply --coaches=prenom_nom,autre_coach
//
// Nécessite serviceAccount.json à la racine du projet (clé de compte de service
// Firebase Admin — ne pas commit, voir .gitignore).

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { randomInt } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { slug } from "../src/utils/slug.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args      = process.argv.slice(2);
const APPLY     = args.includes("--apply");
const coachArg  = args.find((a) => a.startsWith("--coaches="));
const COACH_IDS = new Set(
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

const DOMAIN     = "@archers-tinteniac.fr";
const MIN_PWD_LEN = 6; // minimum imposé par Firebase Auth

// Mot de passe provisoire lisible (pas de 0/O ni 1/l) : 8 caractères.
function motDePasseProvisoire() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function decodePassword(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}

// Même logique que le fallback de src/hooks/useAuth.js pour les anciens
// documents où le nom complet est stocké dans `nom` seul.
function resolveNames(id, data) {
  if (data.prenom) return { prenom: data.prenom.trim(), nom: (data.nom || "").trim() };
  if (data.nom) {
    const parts = data.nom.trim().split(/\s+/);
    return { prenom: parts[0] ?? "", nom: parts.slice(1).join(" ") };
  }
  const parts = id.split("_");
  return { prenom: parts[0] ?? id, nom: parts.slice(1).join(" ") };
}

async function main() {
  const snap = await db.collection("users").get();
  console.log(`${snap.size} document(s) dans "users".\n`);
  console.log(APPLY ? "Mode : --apply (modifications réelles)\n" : "Mode : dry-run (aucune modification)\n");

  const report = { migrated: [], skipped: [], errors: [], provisoires: [] };

  for (const id of COACH_IDS) {
    if (!snap.docs.some((d) => d.id === id)) {
      report.errors.push({ id, reason: "coach demandé mais aucun compte \"users\" avec cet identifiant" });
    }
  }

  for (const docSnap of snap.docs) {
    const id   = docSnap.id;
    const data = docSnap.data();

    if (!data.mdp) {
      report.skipped.push({ id, reason: "pas de champ mdp (déjà migré ?)" });
      continue;
    }

    const { prenom, nom } = resolveNames(id, data);
    if (!prenom || !nom) {
      report.errors.push({ id, reason: "prénom/nom introuvable" });
      continue;
    }

    let password;
    try {
      password = decodePassword(data.mdp);
    } catch (err) {
      report.errors.push({ id, reason: `décodage mdp impossible : ${err.message}` });
      continue;
    }
    let provisoire = null;
    if (!password || password.length < MIN_PWD_LEN) {
      provisoire = APPLY ? motDePasseProvisoire() : "(généré à l'application)";
      password = provisoire;
    }

    const loginKey = slug(prenom, nom);
    const email    = `${loginKey}${DOMAIN}`;
    const isCoach  = COACH_IDS.has(id);

    console.log(`${APPLY ? "→" : "[dry-run]"} ${id} : ${prenom} ${nom} -> ${email}${isCoach ? "  [coach]" : ""}${provisoire ? "  [mot de passe trop court → provisoire]" : ""}`);

    if (!APPLY) {
      report.migrated.push({ id, email, coach: isCoach });
      if (provisoire) report.provisoires.push({ id, prenom, nom, provisoire });
      continue;
    }

    try {
      await auth.createUser({ uid: id, email, password });
      if (isCoach) {
        await auth.setCustomUserClaims(id, { coach: true });
      }
      await db.collection("users").doc(id).update({
        prenom,
        nom,
        loginKey,
        mdp: FieldValue.delete(),
      });
      report.migrated.push({ id, email, coach: isCoach });
      if (provisoire) report.provisoires.push({ id, prenom, nom, provisoire });
    } catch (err) {
      report.errors.push({ id, reason: err.message });
    }
  }

  console.log("\n── Rapport ──────────────────────────────────────");
  console.log(`Migrés  : ${report.migrated.length}`);
  console.log(`Ignorés : ${report.skipped.length}`);
  console.log(`Erreurs : ${report.errors.length}`);

  if (report.skipped.length) {
    console.log("\nIgnorés :");
    report.skipped.forEach((r) => console.log(`  - ${r.id} : ${r.reason}`));
  }
  if (report.provisoires.length) {
    console.log("\nMots de passe provisoires (ancien mot de passe trop court) — à transmettre :");
    report.provisoires.forEach((r) => console.log(`  - ${r.prenom} ${r.nom} : ${r.provisoire}`));
  }
  if (report.errors.length) {
    console.log("\nErreurs :");
    report.errors.forEach((r) => console.log(`  - ${r.id} : ${r.reason}`));
  }
  if (!APPLY) {
    console.log("\nDry-run — rien n'a été modifié. Relancer avec --apply pour exécuter.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
