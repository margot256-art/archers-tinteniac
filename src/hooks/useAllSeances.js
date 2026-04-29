import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useAllSeances() {
  const [seances, setSeances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

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

  return { seances, loading, error, deleteSeance };
}
