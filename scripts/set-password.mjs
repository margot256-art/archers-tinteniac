import { initializeApp }       from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { readFileSync }          from "fs";
import { fileURLToPath }         from "url";
import { dirname, join }         from "path";

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

// Même encodage que useAuth.js
const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

const password  = "Noah1431LR";
const encoded   = toBase64(password);
// U+2019 = apostrophe typographique, confirmé par check-users.mjs
const docId     = "florence_le_manac’h";

console.log(`Mise à jour du mot de passe pour "${docId}"`);
console.log(`Mot de passe encodé : ${encoded}`);

await updateDoc(doc(db, "users", docId), { mdp: encoded });

console.log("✓ Mot de passe mis à jour avec succès.");
process.exit(0);
