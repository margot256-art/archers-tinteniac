// Sauvegarde complète de la base (toutes les collections Firestore) et de la liste
// des comptes de connexion (identifiant, e-mail, droit coach — jamais de mot de
// passe) dans un fichier sauvegardes/AAAA-MM-JJ_HHhMM.json.
// Gratuit (les sauvegardes automatiques de Firebase demandent le forfait payant).
// À lancer régulièrement, par exemple une fois par mois :
//   node scripts/sauvegarder.mjs
//
// Le dossier sauvegardes/ n'est jamais envoyé sur GitHub (voir .gitignore) :
// il contient les données personnelles des archers, à garder pour soi.
// Nécessite serviceAccount.json à la racine du projet.
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

initializeApp({ credential: cert(JSON.parse(readFileSync(new URL("../serviceAccount.json", import.meta.url), "utf8"))) });
const db = getFirestore();

// Dates Firestore → texte ISO, pour un fichier JSON lisible.
const enJson = (v) => {
  if (v instanceof Timestamp) return { __date: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(enJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enJson(x)]));
  return v;
};

const sauvegarde = { date: new Date().toISOString(), collections: {}, comptes: [] };

for (const col of await db.listCollections()) {
  const snap = await col.get();
  sauvegarde.collections[col.id] = Object.fromEntries(snap.docs.map((d) => [d.id, enJson(d.data())]));
  console.log(`${col.id} : ${snap.size} document(s)`);
}

let page;
do {
  const res = await getAuth().listUsers(1000, page);
  for (const u of res.users) {
    sauvegarde.comptes.push({ uid: u.uid, email: u.email, coach: u.customClaims?.coach === true });
  }
  page = res.pageToken;
} while (page);
console.log(`comptes de connexion : ${sauvegarde.comptes.length}`);

const d = new Date();
const deux = (n) => String(n).padStart(2, "0");
const nom = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}h${deux(d.getMinutes())}.json`;
const dossier = new URL("../sauvegardes/", import.meta.url);
mkdirSync(dossier, { recursive: true });
writeFileSync(new URL(nom, dossier), JSON.stringify(sauvegarde, null, 2));
console.log(`\nSauvegarde enregistrée : sauvegardes/${nom}`);
process.exit(0);
