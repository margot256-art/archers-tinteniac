import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCuAVIS5J0CQo2cIB9C2LT3yksNGGvlmJs",
  projectId: "archers-tinteniac",
  appId: "1:237137485161:web:85802a6b7754fee83031f8",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
