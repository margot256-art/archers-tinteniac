import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:    import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:     import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Cache local persistant : les séances restent lisibles sans réseau (au pas de
// tir), et les écritures faites hors ligne sont gardées sur l'appareil puis
// envoyées au serveur au retour du réseau, même si l'appli a été fermée entre-temps.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export default app;

/**
 * Lance une écriture Firestore sans attendre la réponse du serveur. Avec le cache
 * local, l'écriture est appliquée tout de suite sur l'appareil (les écrans se
 * mettent à jour) ; hors ligne, la réponse du serveur ne viendrait qu'au retour
 * du réseau et bloquerait l'écran sur « Enregistrement… ». Seul un refus du
 * serveur (droits, données invalides) reste à signaler.
 */
export function sansAttendreLeServeur(ecriture, contexte) {
  ecriture.catch((err) => console.error(`[${contexte}] écriture refusée par le serveur :`, err));
}
