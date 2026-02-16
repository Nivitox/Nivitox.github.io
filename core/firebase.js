import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "***REMOVED***",
  authDomain: "alternativa-3985d.firebaseapp.com",
  projectId: "alternativa-3985d",
  storageBucket: "alternativa-3985d.firebasestorage.app",
  messagingSenderId: "596206910556",
  appId: "1:596206910556:web:fe013a71f8e656ec417a99"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
