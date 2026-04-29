/**
 * Migration : apostrophe droite (U+0027) → apostrophe typographique (U+2019)
 * Collections : users, seances, objectifs
 *
 * Usage : node scripts/fix-apostrophe.mjs
 */

import { initializeApp }                        from "firebase/app";
import { getFirestore, collection, getDocs,
         doc, setDoc, deleteDoc, updateDoc }     from "firebase/firestore";
import { readFileSync }                          from "fs";
import { fileURLToPath }                         from "url";
import { dirname, join }                         from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const envRaw = readFileSync(join(__dirname, "../.env"), "utf8");
const env    = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const app = initializeApp({
  apiKey:    env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId:     env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);

// ── Constantes ────────────────────────────────────────────────────────────────

const STRAIGHT    = "'"; // '  apostrophe droite (clavier)
const TYPOGRAPHIC = "’"; // '  apostrophe typographique

const COLLECTIONS = ["users", "seances", "objectifs"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fix = (s) => typeof s === "string" ? s.replaceAll(STRAIGHT, TYPOGRAPHIC) : s;

// ── Migration ─────────────────────────────────────────────────────────────────

async function migrate() {
  let docsModified = 0;

  for (const collName of COLLECTIONS) {
    console.log(`\n=== Collection : ${collName} ===`);

    let snap;
    try {
      snap = await getDocs(collection(db, collName));
    } catch (e) {
      console.log(`  ⚠  Impossible de lire : ${e.message}`);
      continue;
    }

    if (snap.empty) { console.log("  (vide)"); continue; }

    for (const docSnap of snap.docs) {
      const id   = docSnap.id;
      const data = docSnap.data();

      // 1. Mise à jour des valeurs de champs string
      const fieldUpdates = {};
      for (const [key, val] of Object.entries(data)) {
        if (typeof val === "string" && val.includes(STRAIGHT)) {
          fieldUpdates[key] = fix(val);
          console.log(`  champ  [${id}] .${key}`);
          console.log(`         avant : ${JSON.stringify(val)}`);
          console.log(`         après : ${JSON.stringify(fieldUpdates[key])}`);
        }
      }

      if (Object.keys(fieldUpdates).length > 0) {
        await updateDoc(doc(db, collName, id), fieldUpdates);
        docsModified++;
      }

      // 2. Renommage de l'ID (uniquement si l'ID lui-même contient l'apostrophe droite)
      if (collName === "users" && id.includes(STRAIGHT)) {
        const newId   = fix(id);
        const newData = { ...data, ...fieldUpdates };
        console.log(`  id     "${id}"`);
        console.log(`       → "${newId}"`);
        await setDoc(doc(db, "users", newId), newData);
        await deleteDoc(doc(db, "users", id));
        docsModified++;
      }
    }
  }

  console.log(`\n✓ Migration terminée — ${docsModified} document(s) modifié(s)`);
  process.exit(0);
}

migrate().catch(err => {
  console.error("\n✗ Erreur :", err.message);
  process.exit(1);
});
