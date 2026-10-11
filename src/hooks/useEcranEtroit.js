import { useSyncExternalStore } from "react";

// Écran étroit (téléphone) : les tableaux larges passent en cartes empilées.
const REQUETE = "(max-width: 700px)";

const sAbonner = (f) => {
  const mq = window.matchMedia(REQUETE);
  mq.addEventListener("change", f);
  return () => mq.removeEventListener("change", f);
};
const lire = () => window.matchMedia(REQUETE).matches;

export function useEcranEtroit() {
  return useSyncExternalStore(sAbonner, lire, () => false);
}
