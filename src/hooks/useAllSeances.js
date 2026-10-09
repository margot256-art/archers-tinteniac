import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useAllSeances() {
  const [seances, setSeances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const q = query(collection(db, "seances"), orderBy("date", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSeances(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("[useAllSeances]", err);
        setError("Impossible de charger les séances.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const deleteSeance = async (id) => {
    try {
      await deleteDoc(doc(db, "seances", id));
    } catch (err) {
      console.error("[useAllSeances] suppression :", err);
    }
  };

  // Retour du coach sur une journée d'un archer : recopié sur chaque exercice de
  // la journée, comme le commentaire de séance de l'archer.
  const updateRetourCoach = async (ids, texte) => {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, "seances", id), { retourCoach: texte.trim() || null });
    }
    await batch.commit();
  };

  return { seances, loading, error, deleteSeance, updateRetourCoach };
}
