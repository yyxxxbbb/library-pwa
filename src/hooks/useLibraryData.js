import { useState, useEffect } from 'react';
import { auth, db } from '../firebase'; // firebase 설정 파일 경로 확인!
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { subscribeToSeats } from '../api/seatApi'; // 좌석 구독 API 경로 확인!

export const useLibraryData = () => {
  const [seats, setSeats] = useState([]);
  const [user, setUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);

  // 1. 좌석 정보 실시간 구독
  useEffect(() => {
    const unsubscribeSeats = subscribeToSeats((fetchedSeats) => {
      const sorted = [...fetchedSeats].sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true })
      );
      setSeats(sorted);
    });
    return () => unsubscribeSeats();
  }, []);

  // 2. 로그인 상태 감시
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribeAuth();
  }, []);

  // 3. 내 상세 정보(User 컬렉션) 실시간 구독
  useEffect(() => {
    if (user) {
      const studentNo = user.email.split('@')[0];
      const unsubUser = onSnapshot(doc(db, "User", studentNo), (snap) => {
        if (snap.exists()) setCurrentUserData(snap.data());
      });
      return () => unsubUser();
    } else {
      setCurrentUserData(null);
    }
  }, [user]);

  // App.jsx에서 { seats, user ... } 식으로 가져다 쓸 수 있게 반환
  return { seats, user, currentUserData, setSeats, setUser };
};