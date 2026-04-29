import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";

export function useSeances() {
  const { user } = useAuth();
  const [seances, setSeances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;

    const fullName = `${user.prenom} ${user.nom}`;

    const q = query(
      collection(db, "seances"),
      where("archer", "==", fullName)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        setSeances(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useSeances] erreur :", err);
        setError("Impossible de charger les séances.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const deleteSeance = async (id) => {
    try {
      await deleteDoc(doc(db, "seances", id));
    } catch (err) {
      console.error("[useSeances] erreur suppression :", err);
    }
  };

  const updateSeance = async (id, fields) => {
    await updateDoc(doc(db, "seances", id), fields);
  };

  return { seances, loading, error, deleteSeance, updateSeance };
}
