// Fusionne toutes les séances de "Celine BAJARD" → "Céline BAJARD"
// et met à jour le document utilisateur si nécessaire.

import { initializeApp }            from "firebase/app";
import { getFirestore, collection, getDocs, query, where, updateDoc, doc, getDoc, deleteDoc } from "firebase/firestore";
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

const FROM_NAMES  = ["Celine BAJARD", "Celine Bajard"];  // doublons à migrer
const TO_NAME     = "Céline BAJARD";    // nom canonique à garder
const FROM_ID     = "celine_bajard";
const TO_ID       = "céline_bajard";

console.log(`\nFusion : ${FROM_NAMES.join(", ")} → "${TO_NAME}"\n`);

// ── 1. Séances ────────────────────────────────────────────────────────────────
let totalMigre = 0;
for (const fromName of FROM_NAMES) {
  const q = query(collection(db, "seances"), where("archer", "==", fromName));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log(`Aucune séance pour "${fromName}"`);
  } else {
    console.log(`${snap.size} séance(s) pour "${fromName}"…`);
    for (const d of snap.docs) {
      await updateDoc(doc(db, "seances", d.id), { archer: TO_NAME, archerId: TO_ID });
      console.log(`  ✓ ${d.id} mis à jour`);
      totalMigre++;
    }
  }
}
console.log(`\nTotal séances migrées : ${totalMigre}`);

// ── 2. Objectifs ──────────────────────────────────────────────────────────────
const objFrom = await getDoc(doc(db, "objectifs", FROM_ID));
const objTo   = await getDoc(doc(db, "objectifs", TO_ID));

if (objFrom.exists() && !objTo.exists()) {
  // Copier les objectifs vers le bon ID
  const { setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "objectifs", TO_ID), objFrom.data());
  await deleteDoc(doc(db, "objectifs", FROM_ID));
  console.log(`\nObjectifs copiés de "${FROM_ID}" → "${TO_ID}" et ancien doc supprimé.`);
} else if (objFrom.exists() && objTo.exists()) {
  console.log(`\nATTENTION : objectifs existent dans les deux docs. Suppression de "${FROM_ID}" uniquement.`);
  await deleteDoc(doc(db, "objectifs", FROM_ID));
} else {
  console.log(`\nPas d'objectifs à migrer pour "${FROM_ID}".`);
}

// ── 3. Utilisateur ────────────────────────────────────────────────────────────
const userFrom = await getDoc(doc(db, "users", FROM_ID));
if (userFrom.exists()) {
  const userTo = await getDoc(doc(db, "users", TO_ID));
  if (!userTo.exists()) {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "users", TO_ID), { ...userFrom.data(), prenom: "Céline", nom: "BAJARD" });
    console.log(`Utilisateur copié vers "${TO_ID}".`);
  }
  await deleteDoc(doc(db, "users", FROM_ID));
  console.log(`Ancien utilisateur "${FROM_ID}" supprimé.`);
} else {
  console.log(`Pas de document utilisateur pour "${FROM_ID}".`);
}

console.log("\nFusion terminée.\n");
process.exit(0);
