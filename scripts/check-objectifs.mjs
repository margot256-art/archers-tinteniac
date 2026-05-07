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

// ── Objectifs ─────────────────────────────────────────────────────────────────
console.log("\n=== OBJECTIFS ===");
const objSnap = await getDocs(collection(db, "objectifs"));
for (const d of objSnap.docs) {
  const data = d.data();
  console.log(`\n  ID doc   : "${d.id}"`);
  console.log(`  archer   : "${data.archer ?? "—"}"`);
  console.log(`  archerId : "${data.archerId ?? "—"}"`);
  if (data.saisons) {
    for (const [saison, val] of Object.entries(data.saisons)) {
      console.log(`  saison ${saison} → volEntr=${val.volEntr ?? "—"}, distances=${JSON.stringify(val.distances ?? {})}`);
    }
  }
  if (data.volEntr != null) console.log(`  volEntr (ancien format) : ${data.volEntr}`);
}

// ── ArcherIds distincts dans les séances ──────────────────────────────────────
console.log("\n=== ARCHERIDS DANS LES SÉANCES ===");
const seancesSnap = await getDocs(collection(db, "seances"));
const archerMap = {};
for (const d of seancesSnap.docs) {
  const { archer, archerId } = d.data();
  if (!archer) continue;
  if (!archerMap[archer]) archerMap[archer] = new Set();
  if (archerId) archerMap[archer].add(archerId);
}
for (const [name, ids] of Object.entries(archerMap).sort()) {
  console.log(`  "${name}" → archerId(s): ${[...ids].map(i => `"${i}"`).join(", ") || "AUCUN"}`);
}

process.exit(0);
