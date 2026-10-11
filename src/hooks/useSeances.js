import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, deleteDoc, updateDoc, doc, writeBatch } from "firebase/firestore";
import { db, sansAttendreLeServeur } from "../lib/firebase";
import { useAuth } from "./useAuth";

export function useSeances() {
  const { user } = useAuth();
  const [seances, setSeances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;

    // Les séances sont rattachées à l'archer par son identifiant (`archerId` = uid
    // Firebase Auth), qui ne change pas si le nom est corrigé et distingue deux
    // homonymes. Toutes les séances en ont un (anciennes rattachées le 2026-10-10 par
    // scripts/rattacher-archerid.mjs) ; les règles Firestore refusent d'ailleurs toute
    // autre requête à un archer.
    const unsub = onSnapshot(
      query(collection(db, "seances"), where("archerId", "==", user.id)),
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => {
            const raw = d.data({ serverTimestamps: "estimate" });
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

  // Les écritures ne bloquent pas l'écran en attendant le serveur (voir sansAttendreLeServeur).
  const deleteSeance = async (id) => {
    sansAttendreLeServeur(deleteDoc(doc(db, "seances", id)), "useSeances");
  };

  const updateSeance = async (id, fields) => {
    sansAttendreLeServeur(updateDoc(doc(db, "seances", id), fields), "useSeances");
  };

  // Le commentaire de séance est recopié sur chaque exercice de la séance
  // (une séance n'est qu'un regroupement de docs par seanceId).
  const updateCommentaireSeance = async (ids, texte) => {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, "seances", id), { commentaireSeance: texte.trim() || null });
    }
    sansAttendreLeServeur(batch.commit(), "useSeances");
  };

  // Modifie des champs communs (date, distance, type, lieu…) sur tous les exercices d'une séance.
  const modifierSeance = async (ids, champs) => {
    const batch = writeBatch(db);
    for (const id of ids) batch.update(doc(db, "seances", id), champs);
    sansAttendreLeServeur(batch.commit(), "useSeances");
  };

  // Supprime une séance entière : tous ses exercices d'un coup.
  const supprimerSeance = async (ids) => {
    const batch = writeBatch(db);
    for (const id of ids) batch.delete(doc(db, "seances", id));
    sansAttendreLeServeur(batch.commit(), "useSeances");
  };

  return { seances, loading, error, deleteSeance, updateSeance, updateCommentaireSeance, modifierSeance, supprimerSeance };
}
