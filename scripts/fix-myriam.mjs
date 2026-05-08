// Normalise les séances "MYRIAM LEBRETON" → "Myriam LEBRETON"
// et met à jour le doc utilisateur pour avoir prenom/nom séparés.

import { initializeApp }            from "firebase/app";
import { getFirestore, collection, getDocs, query, where, updateDoc, doc, getDoc } from "firebase/firestore";
import { readFileSync }             from "fs";
import { fileURLToPath }            from "url";
import { dirname, join }            from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, "../.env"), "utf8");
const env    = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const CANON_NAME = "Myriam LEBRETON";
const CANON_ID   = "myriam_lebreton";

// ── 1. Séances avec mauvaise casse ────────────────────────────────────────────
const variantsToFix = ["MYRIAM LEBRETON", "myriam lebreton", "Myriam Lebreton"];
let total = 0;
for (const variant of variantsToFix) {
  const q = query(collection(db, "seances"), where("archer", "==", variant));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log(`Aucune séance pour "${variant}"`);
  } else {
    console.log(`${snap.size} séance(s) pour "${variant}" → correction…`);
    for (const d of snap.docs) {
      await updateDoc(doc(db, "seances", d.id), { archer: CANON_NAME, archerId: CANON_ID });
      console.log(`  ✓ ${d.id}`);
      total++;
    }
  }
}
console.log(`\nTotal séances corrigées : ${total}`);

// ── 2. Document utilisateur — ajouter prenom/nom séparés ─────────────────────
const userDoc = await getDoc(doc(db, "users", CANON_ID));
if (userDoc.exists()) {
  const data = userDoc.data();
  if (!data.prenom) {
    await updateDoc(doc(db, "users", CANON_ID), { prenom: "Myriam", nom: "LEBRETON" });
    console.log(`\nDoc utilisateur mis à jour : prenom="Myriam", nom="LEBRETON"`);
  } else {
    console.log(`\nDoc utilisateur déjà à jour (prenom="${data.prenom}", nom="${data.nom}")`);
  }
} else {
  console.log(`\nATTENTION : pas de doc utilisateur pour "${CANON_ID}"`);
}

console.log("\nTerminé.\n");
process.exit(0);
