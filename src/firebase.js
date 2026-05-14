import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage"; // 👈 Storage 기능 추가!

const firebaseConfig = {
  apiKey: "AIzaSyD0sygIx9DjXWVArWUhDy_9ImMI5QlN600",
  authDomain: "library-pwa-78026.firebaseapp.com",
  projectId: "library-pwa-78026",
  storageBucket: "library-pwa-78026.firebasestorage.app", // 아주 잘 들어가 있습니다!
  messagingSenderId: "728116213936",
  appId: "1:728116213936:web:0d21a9894586a37e4aa375",
  measurementId: "G-1ZXQ9EJJ3J"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app); // 👈 Storage 내보내기 추가!