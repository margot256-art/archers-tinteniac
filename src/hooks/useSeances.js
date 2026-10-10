import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, deleteDoc, updateDoc, doc, writeBatch } from "firebase/firestore";
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
          .map((d) => {
            const raw = d.data();
            return { id: d.id, ...raw, distance: raw.distance === "18 ans" ? "18m" : raw.distance };
          })
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

  // Le commentaire de séance est recopié sur chaque exercice de la séance
  // (une séance n'est qu'un regroupement de docs par seanceId).
  const updateCommentaireSeance = async (ids, texte) => {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, "seances", id), { commentaireSeance: texte.trim() || null });
    }
    await batch.commit();
  };

  // Modifie des champs communs (date, distance, type, lieu…) sur tous les exercices d'une séance.
  const modifierSeance = async (ids, champs) => {
    const batch = writeBatch(db);
    for (const id of ids) batch.update(doc(db, "seances", id), champs);
    await batch.commit();
  };

  // Supprime une séance entière : tous ses exercices d'un coup.
  const supprimerSeance = async (ids) => {
    const batch = writeBatch(db);
    for (const id of ids) batch.delete(doc(db, "seances", id));
    await batch.commit();
  };

  return { seances, loading, error, deleteSeance, updateSeance, updateCommentaireSeance, modifierSeance, supprimerSeance };
}
