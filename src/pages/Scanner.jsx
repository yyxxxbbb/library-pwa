import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../firebase'; 
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 

export default function ScannerPage({ setViewMode }) {
  const [scanData, setScanData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleScan = async (result) => {
    if (isLoading || !result || result.length === 0) return;

    // 1️⃣ 학생이 띄운 QR코드 데이터 읽기 (예: "student123_170123456789")
    const rawScannedText = result[0].rawValue.trim(); 
    setScanData(rawScannedText);
    setIsLoading(true); 
    
    try {
      // 2️⃣ "_"를 기준으로 앞부분인 순수 학번(아이디)만 추출
      const actualStudentId = rawScannedText.split('_')[0];

      // 3️⃣ 'Reservations'(예약) 데이터베이스에서 이 학생의 현재 대기중인 예약 찾기
      const resRef = collection(db, "Reservations");
      const q = query(resRef, where("status", "==", "RESERVED"));
      const snapshot = await getDocs(q);

      // 예약 목록 중 학번이 일치하는 예약건 찾기
      const targetReservation = snapshot.docs.find(d => {
        const data = d.data();
        return data.userId && data.userId.includes(actualStudentId);
      });

      if (!targetReservation) {
        alert(`❌ [${actualStudentId}] 님의 예약된 좌석을 찾을 수 없거나 이미 입실하셨습니다.`);
        setIsLoading(false);
        return;
      }

      // 4️⃣ 예약 상태를 'OCCUPIED(사용중)'로 변경
      const targetDocRef = doc(db, "Reservations", targetReservation.id);
      await updateDoc(targetDocRef, {
        status: 'OCCUPIED',
        checkedInAt: serverTimestamp()
      });

      // 5️⃣ 체크인 기록(Log) 저장
      await addDoc(collection(db, "Log"), {
        action: "CHECK_IN",
        seatId: targetReservation.data().seatId,
        uid: targetReservation.data().userId,
        createdAt: serverTimestamp()
      });

      alert(`✅ [${actualStudentId}]님 입실 확인 완료!\n(좌석: ${targetReservation.data().seatId})`);
      
    } catch (error) {
      console.error("인증 에러:", error);
      alert(`❌ 인증 실패: ${error.message || error}`);
    } finally {
      // 2초 후 다시 스캔 가능하도록 쿨타임
      setTimeout(() => {
        setIsLoading(false);
        setScanData(null);
      }, 2000); 
    }
  };

  const handleError = (error) => {
    console.error(error);
    alert(`📸 카메라 에러: ${error?.message || "알 수 없는 에러"}`);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2 style={{ color: '#0f172a', fontWeight: '900', marginBottom: '20px' }}>
        📸 입구 스캐너 (QR 입실)
      </h2>

      <div style={{ maxWidth: '400px', margin: '0 auto', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', position: 'relative' }}>
        
        {isLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.2rem', color: '#2563eb' }}>
            ⏳ 인증 처리 중...
          </div>
        )}

        {/* 바코드 스캐너 렌더링 컴포넌트 */}
        <Scanner 
          onScan={handleScan}
          onError={handleError}
          formats={['qr_code']}
          styles={{ container: { width: '100%', aspectRatio: '1' } }}
        />
      </div>

      <div style={{ marginTop: '30px', background: '#eff6ff', padding: '20px', borderRadius: '15px', maxWidth: '400px', margin: '30px auto' }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: '900', color: '#1e3a8a' }}>💡 스캐너 사용 방법</p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#3b82f6', lineHeight: '1.5' }}>
          학생이 앱에서 띄운 [QR 인증하기] 화면을 이 카메라 사각형 안에 맞춰주세요. 자동으로 입실 처리됩니다.
        </p>
      </div>
      
      <button 
        onClick={() => setViewMode('MAP')} 
        style={{ marginTop: '20px', padding: '14px 30px', background: '#475569', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>
        뒤로가기
      </button>
    </div>
  );
}