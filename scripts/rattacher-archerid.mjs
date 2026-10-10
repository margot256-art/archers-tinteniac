// Rattache à leur archer les anciennes séances qui n'ont pas d'`archerId`.
//
// Pour chaque séance sans identifiant, on cherche l'identifiant de l'archer à
// partir de son nom complet (`archer`) :
//   - dans les comptes (`users`, l'identifiant est l'id du document) ;
//   - dans ses autres séances qui ont déjà un `archerId`.
// Une séance n'est rattachée que si on trouve exactement UN identifiant ;
// sinon (aucun ou plusieurs), elle est listée et laissée telle quelle.
//
// Usage :
//   node scripts/rattacher-archerid.mjs           → simulation, n'écrit rien
//   node scripts/rattacher-archerid.mjs --apply   → écrit les `archerId`
// Les noms et identifiants s'affichent ; aucun mot de passe n'est lu ni affiché.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

console.log(`Projet Firebase : ${env.VITE_FIREBASE_PROJECT_ID}`);
console.log(APPLY ? "Mode : ÉCRITURE (--apply)\n" : "Mode : simulation (rien n'est écrit)\n");

const db = getFirestore(initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}));

// Comparaison des noms insensible à la casse, aux espaces et aux variantes d'apostrophe.
const cle = (s) => s.replace(/['`´ʼ'ʹ]/g, "'").trim().toLowerCase().replace(/\s+/g, " ");
const ajouter = (map, k, id) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(id); };

const idsParNom = new Map();

for (const u of (await getDocs(collection(db, "users"))).docs) {
  const { prenom, nom } = u.data();
  const complet = prenom ? `${prenom} ${nom ?? ""}` : nom; // ancien format : nom complet dans `nom`
  if (complet) ajouter(idsParNom, cle(complet), u.id);
}

const seances = (await getDocs(collection(db, "seances"))).docs;
for (const s of seances) {
  const { archer, archerId } = s.data();
  if (archer && archerId) ajouter(idsParNom, cle(archer), archerId);
}

const aRattacher = [];
const bilan = new Map();
for (const s of seances) {
  const { archer, archerId } = s.data();
  if (archerId) continue;
  const ids = [...(idsParNom.get(cle(archer ?? "")) ?? [])];
  const etat = ids.length === 1 ? `→ ${ids[0]}` : ids.length === 0 ? "aucun archer trouvé" : `AMBIGU : ${ids.join(", ")}`;
  if (ids.length === 1) aRattacher.push({ id: s.id, archerId: ids[0] });
  const b = bilan.get(archer) ?? { n: 0, etat };
  b.n++;
  bilan.set(archer, b);
}

for (const [archer, { n, etat }] of [...bilan].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
  console.log(`${String(n).padStart(4)}  ${archer}  ${etat}`);
}
const total = [...bilan.values()].reduce((t, b) => t + b.n, 0);
console.log(`\nSéances sans identifiant : ${total} · rattachables : ${aRattacher.length} · laissées telles quelles : ${total - aRattacher.length}`);

if (APPLY && aRattacher.length) {
  for (let i = 0; i < aRattacher.length; i += 400) {
    const batch = writeBatch(db);
    for (const { id, archerId } of aRattacher.slice(i, i + 400)) batch.update(doc(db, "seances", id), { archerId });
    await batch.commit();
  }
  console.log(`${aRattacher.length} séances rattachées.`);
} else if (!APPLY) {
  console.log("\nPour appliquer : node scripts/rattacher-archerid.mjs --apply");
}
process.exit(0);
