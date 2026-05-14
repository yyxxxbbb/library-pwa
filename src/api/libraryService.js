import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const handleLibraryAction = async ({
  actionType, seat, user, isAdmin, selectedDate, startTime, endTime, setSelectedSeat
}) => {
  if (!user) return alert("로그인이 필요합니다.");
  
  const studentNo = user.email.split('@')[0];

  // 🔥 [치명적 버그 수정] 영국 시간(UTC) 기준이 아닌, 내 컴퓨터의 완벽한 한국 로컬 시간을 뽑아냅니다!
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`; // 정확한 오늘 날짜 생성 완료!

  if (actionType === 'RESERVED') {
    try {
      // 1. 1인 1좌석 제한 체크
      if (!isAdmin) {
        const resRef = collection(db, "Reservations");
        const q = query(
          resRef, 
          where("userId", "==", user.email),
          where("date", "==", dateStr)
        );
        const querySnapshot = await getDocs(q);
        const activeRes = querySnapshot.docs.find(d => d.data().status !== 'RETURNED');
        
        if (activeRes) {
          alert("🚨 이미 예약하거나 사용 중인 좌석이 있습니다.\n기존 예약을 취소 후 이용해주세요.");
          if (setSelectedSeat) setSelectedSeat(null);
          return;
        }
      }

      // 2. 예약 진행 (한국 시간 날짜와 유저가 고른 시간으로 찰떡같이 저장)
      await addDoc(collection(db, "Reservations"), {
        seatId: seat.id,
        userId: user.email,
        studentNo: studentNo,
        date: dateStr,
        startTime: startTime, 
        endTime: endTime,     
        status: "RESERVED",
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, "Log"), {
        action: "RESERVE",
        seatId: seat.id,
        seatLabel: seat.label || seat.id,
        uid: user.email,
        createdAt: serverTimestamp()
      });

      alert("✅ 예약이 완료되었습니다.");
    } catch (e) {
      console.error(e);
      alert("예약 중 오류가 발생했습니다.");
    }
  }

  // 모달 닫기
  if (setSelectedSeat) setSelectedSeat(null);
};