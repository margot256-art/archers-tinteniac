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

    const fullName = `${user.prenom} ${user.nom}`;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;

    // Les séances sont rattachées à l'archer par son identifiant (`archerId`), qui ne
    // change pas si le nom est corrigé et distingue deux homonymes. Les plus anciennes
    // n'en ont pas : on les retrouve encore par le nom complet, en écartant celles
    // qui portent l'identifiant d'un autre archer.
    const parId  = new Map();
    const parNom = new Map();
    const recus  = { id: false, nom: false };

    const publier = () => {
      if (!recus.id || !recus.nom) return;
      const data = [...new Map([...parNom, ...parId]).values()]
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      setSeances(data);
      setLoading(false);
    };

    const lire = (d) => {
      const raw = d.data();
      return { id: d.id, ...raw, distance: raw.distance === "18 ans" ? "18m" : raw.distance };
    };

    const surErreur = (err) => {
      console.error("[useSeances] erreur :", err);
      setError("Impossible de charger les séances.");
      setLoading(false);
    };

    const unsubId = onSnapshot(
      query(collection(db, "seances"), where("archerId", "==", archerId)),
      (snapshot) => {
        parId.clear();
        for (const d of snapshot.docs) parId.set(d.id, lire(d));
        recus.id = true;
        publier();
      },
      surErreur
    );

    const unsubNom = onSnapshot(
      query(collection(db, "seances"), where("archer", "==", fullName)),
      (snapshot) => {
        parNom.clear();
        for (const d of snapshot.docs) {
          const s = lire(d);
          if (!s.archerId || s.archerId === archerId) parNom.set(d.id, s);
        }
        recus.nom = true;
        publier();
      },
      surErreur
    );

    return () => { unsubId(); unsubNom(); };
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
