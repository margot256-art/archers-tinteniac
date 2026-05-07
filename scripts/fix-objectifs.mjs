import { initializeApp }            from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
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

const snap = await getDocs(collection(db, "objectifs"));

console.log("\n=== ANALYSE DES DOCUMENTS OBJECTIFS ===\n");

for (const d of snap.docs) {
  const id = d.id;
  const codes = [...id].map(c => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")})`).join("");
  const isOldFormat = id.includes(" ") || /[A-Z]/.test(id);
  console.log(`  "${id}" ${isOldFormat ? "← ANCIEN FORMAT" : ""}`);
  console.log(`  codes : ${codes}`);

  if (isOldFormat) {
    await deleteDoc(doc(db, "objectifs", id));
    console.log(`  ✓ Supprimé\n`);
  } else {
    console.log(`  ✓ Conservé\n`);
  }
}

console.log("Nettoyage terminé.\n");
process.exit(0);
