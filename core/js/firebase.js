import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "***REMOVED***",
    authDomain: "alternativa-3985d.firebaseapp.com",
    projectId: "alternativa-3985d",
    storageBucket: "alternativa-3985d.firebasestorage.app",
    messagingSenderId: "596206910556",
    appId: "1:596206910556:web:fe013a71f8e656ec417a99"
};

let app = null;
let db = null;

try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (error) {
    console.error("Firebase init failed:", error);
}

export const firebaseReady = Boolean(db);
export { db };

export const firestoreApi = {
    async fetchUsers() {
        const snapshot = await getDocs(collection(db, "users"));
        return snapshot.docs.map((item) => {
            const data = item.data();
            return {
                rut: data.rut || item.id,
                ...data
            };
        });
    },

    async saveUser(userData) {
        const id = userData.rut;
        await setDoc(doc(db, "users", id), userData, { merge: true });
        return true;
    },

    async deleteUser(rut) {
        await deleteDoc(doc(db, "users", rut));
        return true;
    },

    async fetchFondoList(localeId = "global") {
        const snapshot = await getDoc(doc(db, "fondo", String(localeId)));
        if (!snapshot.exists()) {
            return [];
        }

        const data = snapshot.data() || {};
        return Array.isArray(data.records) ? data.records : [];
    },

    async saveFondoList(localeId = "global", records = []) {
        await setDoc(
            doc(db, "fondo", String(localeId)),
            {
                localeId: String(localeId),
                records: Array.isArray(records) ? records : [],
                updatedAt: Date.now()
            },
            { merge: true }
        );
        return true;
    }
};
