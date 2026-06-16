import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

console.log("확인용 API 키:", import.meta.env.VITE_GEMINI_API_KEY); // 이 키가 undefined라면 .env 설정 문제입니다.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  authDomain: "library-pwa-78026.firebaseapp.com",
  projectId: "library-pwa-78026",
  storageBucket: "library-pwa-78026.firebasestorage.app",
  messagingSenderId: "728116213936",
  appId: "1:728116213936:web:0d21a9894586a37e4aa375",
  measurementId: "G-1ZXQ9EJJ3J"
};

// 1. Firebase 앱 초기화 (이 과정이 없으면 DB 연결이 불가능합니다)
const app = initializeApp(firebaseConfig);

// 2. 서비스 내보내기 (다른 파일에서 import 해서 사용)
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
auth.languageCode = 'ko';
