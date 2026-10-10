// Rattache à un archer les séances enregistrées sous un autre identifiant
// (ex. nom tapé sans accent avec l'ancien mot de passe coach) : `archerId` et
// `archer` (nom affiché) des séances sont remplacés par ceux de l'archer cible.
// À lancer AVANT l'activation des règles Firestore (accès par la clé de l'appli).
//
// Usage (sans --apply : simulation, rien n'est modifié) :
//   node scripts/fusionner-archer.mjs --de=celine_bajard --vers=céline_bajard --nom="Céline BAJARD"
//   node scripts/fusionner-archer.mjs --de=celine_bajard --vers=céline_bajard --nom="Céline BAJARD" --apply
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, writeBatch } from "firebase/firestore";
import { readFileSync } from "fs";

const args  = process.argv.slice(2);
const arg   = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim();
const APPLY = args.includes("--apply");
const de = arg("de"), vers = arg("vers"), nom = arg("nom");

if (!de || !vers || !nom) {
  console.error('Usage : node scripts/fusionner-archer.mjs --de=ancien_id --vers=id_du_compte --nom="Prénom NOM" [--apply]');
  process.exit(1);
}

const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = getFirestore(initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}));

const seances = (await getDocs(query(collection(db, "seances"), where("archerId", "==", de)))).docs;
console.log(`${seances.length} séance(s) avec l'identifiant "${de}" → "${vers}" (${nom})`);
for (const s of seances) console.log(`  ${s.data().date}  ${s.data().distance ?? ""}  ${s.data().archer}`);

if (APPLY && seances.length) {
  const batch = writeBatch(db);
  for (const s of seances) batch.update(doc(db, "seances", s.id), { archerId: vers, archer: nom });
  await batch.commit();
  console.log(`${seances.length} séance(s) rattachée(s).`);
} else if (!APPLY) {
  console.log("\nSimulation — rien n'a été modifié. Relancer avec --apply pour rattacher.");
}
process.exit(0);
