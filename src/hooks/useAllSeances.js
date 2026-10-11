import { useSyncExternalStore } from "react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

// Toutes les séances du club (pages coach). Une seule écoute Firestore, partagée
// par les onglets : passer du Tableau de bord au Journal n'attend pas un nouveau
// chargement. Les dernières séances lues restent en mémoire (pour le compte
// connecté seulement) et s'affichent tout de suite au retour sur un onglet.
let etat = { seances: [], loading: true, error: null, uid: null };
const abonnes = new Set();
let stop = null;
let arretDiffere = null;

const publier = (maj) => { etat = { ...etat, ...maj }; abonnes.forEach((f) => f()); };

function demarrer() {
  const uid = auth.currentUser?.uid ?? null;
  // Changement de compte : on repart d'une lecture neuve.
  if (etat.uid !== uid) { stop?.(); stop = null; etat = { seances: [], loading: true, error: null, uid }; }
  if (stop) return;
  const q = query(collection(db, "seances"), orderBy("date", "desc"));
  stop = onSnapshot(
    q,
    (snap) => publier({
      seances: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })),
      loading: false, error: null,
    }),
    (err) => {
      console.error("[useAllSeances]", err);
      stop = null;
      publier({ loading: false, error: "Impossible de charger les séances." });
    }
  );
}

function abonner(f) {
  abonnes.add(f);
  clearTimeout(arretDiffere);
  demarrer();
  return () => {
    abonnes.delete(f);
    // Écoute gardée une minute après le dernier onglet coach fermé (aller-retours rapides).
    if (abonnes.size === 0) {
      arretDiffere = setTimeout(() => { if (abonnes.size === 0 && stop) { stop(); stop = null; } }, 60000);
    }
  };
}

export function useAllSeances() {
  const { seances, loading, error } = useSyncExternalStore(abonner, () => etat);

  const deleteSeance = async (id) => {
    try {
      await deleteDoc(doc(db, "seances", id));
    } catch (err) {
      console.error("[useAllSeances] suppression :", err);
    }
  };

  // Retour du coach sur une journée d'un archer : recopié sur chaque exercice de
  // la journée, comme le commentaire de séance de l'archer. Il est marqué non lu
  // (`retourCoachLu: false`) pour que l'archer en soit averti dans l'appli.
  const updateRetourCoach = async (ids, texte) => {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, "seances", id), {
        retourCoach:   texte.trim() || null,
        retourCoachLu: texte.trim() ? false : null,
      });
    }
    await batch.commit();
  };

  return { seances, loading, error, deleteSeance, updateRetourCoach };
}
