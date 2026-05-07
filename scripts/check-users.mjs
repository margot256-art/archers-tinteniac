import { initializeApp }            from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
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

const snap = await getDocs(collection(db, "users"));
console.log(`\n${snap.size} utilisateur(s) :\n`);
for (const d of snap.docs) {
  const id = d.id;
  const codes = [...id].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")}`).join(" ");
  const data = d.data();
  console.log(`  ID : "${id}"`);
  console.log(`  Codes : ${codes}`);
  console.log(`  prenom=${data.prenom}, nom=${data.nom}, mdp=${data.mdp ? "✓ défini" : "✗ ABSENT"}\n`);
}
process.exit(0);
