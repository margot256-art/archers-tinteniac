// Copie exacte de useAuth.js
const normAp  = (s) => s.replace(/['`´ʼ’ʹ]/g, "’");
const toDocId = (prenom, nom) =>
  normAp(`${prenom.trim().toLowerCase()}_${nom.trim().toLowerCase()}`).replace(/\s+/g, "_");

// Lire le fichier source pour voir les bytes exacts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "../src/hooks/useAuth.js"), "utf8");
const normApLine = src.split("\n").find(l => l.includes("normAp") && l.includes("replace"));
console.log("Ligne normAp dans le fichier :");
console.log(normApLine);
console.log("Codes de la regex :", [...(normApLine.match(/\/(.+)\//)?.[1] ?? "")].map(c => "U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")).join(" "));

// Test avec apostrophe droite (ce que tape Florence sur son clavier)
const prenomSaisi = "Florence";
const nomSaisi    = "Le Manac'h"; // apostrophe droite U+0027

const idGenere    = toDocId(prenomSaisi, nomSaisi);
const idFirestore = "florence_le_manac’h"; // U+2019 confirmé par check-users

console.log("\nID généré    :", JSON.stringify(idGenere));
console.log("Codes        :", [...idGenere].map(c => "U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")).join(" "));
console.log("\nID Firestore :", JSON.stringify(idFirestore));
console.log("Codes        :", [...idFirestore].map(c => "U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0")).join(" "));
console.log("\nMatch        :", idGenere === idFirestore ? "✓ OUI" : "✗ NON — VOILÀ LE BUG");
