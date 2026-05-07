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

const snap = await getDocs(collection(db, "seances"));
const bajard = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(s => s.archer?.toLowerCase().includes("bajard"));

console.log(`\n${bajard.length} séance(s) contenant "bajard" :\n`);
for (const s of bajard) {
  const codes = [...(s.archer ?? "")].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")}`).join(" ");
  console.log(`  archer : "${s.archer}"  archerId : "${s.archerId}"  date : ${s.date}`);
  console.log(`  codes  : ${codes}\n`);
}
process.exit(0);
