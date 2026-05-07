import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";

export function useObjectif() {
  const { user } = useAuth();
  const [rawObjectif, setRawObjectif] = useState(null);

  useEffect(() => {
    if (!user) return;
    const archerId = user.id ?? `${user.prenom.toLowerCase()}_${user.nom.toLowerCase()}`;
    const unsub = onSnapshot(doc(db, "objectifs", archerId), (snap) => {
      setRawObjectif(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [user]);

  return rawObjectif;
}
