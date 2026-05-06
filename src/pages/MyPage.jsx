import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase'; 
import QRCodeGen from '../components/QRCodeGen';

const MyPage = ({ user, setViewMode }) => {
  const [userData, setUserData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🚨 컴포넌트 선언부에 setViewMode가 잘 들어있는지 꼭 확인하세요!
  // const MyPage = ({ user, setViewMode }) => { ...

  useEffect(() => {
    // 유저 정보가 없으면 실행 안 함
    if (!user || (!user.uid && !user.studentNo)) return;

    // 현재 유저의 고유 식별자 (uid가 없으면 studentNo 사용)
    const currentUserId = user.uid || user.studentNo;

    // 1️⃣ 내 상태 정보(User 컬렉션) '실시간' 구독
    const userRef = doc(db, 'User', currentUserId);
    const unsubUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        setUserData(userSnap.data());
      }
    });

    // 2️⃣ 내 행동 로그(Log 컬렉션) '실시간' 구독 및 필터링
    const logsRef = collection(db, 'Log'); 
    const unsubLogs = onSnapshot(logsRef, (logSnap) => {
      const logList = logSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(log => 
          log.uid === user?.uid || 
          log.uid === user?.email ||       
          log.studentNo === user?.studentNo || 
          log.studentNo === user?.name      
        )
        .sort((a, b) => {
          const timeA = (a.timestamp || a.createdAt)?.toDate ? (a.timestamp || a.createdAt).toDate() : new Date(0);
          const timeB = (b.timestamp || b.createdAt)?.toDate ? (b.timestamp || b.createdAt).toDate() : new Date(0);
          return timeB - timeA;
        });
      
      setLogs(logList);
      setLoading(false);
    });

    // 🚨 3️⃣ [새로 추가된 마법!] 내 좌석(Seat 컬렉션) 상태 '실시간' 감시
    const myUserId = user?.email || user?.studentNo; 
    const seatsRef = collection(db, 'Seat');
    const q = query(seatsRef, where("userId", "==", myUserId));
    
    const unsubSeat = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // 내 자리 데이터가 방금 막 '수정(modified)' 되었다면
        if (change.type === "modified") {
          const seatData = change.doc.data();
          
          // 방금 키오스크가 내 자리를 '사용 중(OCCUPIED)'으로 바꿨다면!
          if (seatData.status === "OCCUPIED") {
            alert('✅ QR 인증 완료!\n자리 사용을 시작합니다.');
            if (setViewMode) {
              setViewMode('MAP'); // 내 폰 화면을 배치도로 자동 전환!
            }
          }
        }
      });
    });

    // 🧹 컴포넌트가 꺼질 때 구독 3개 모두 깔끔하게 취소 (메모리 누수, 중복 알림 방지)
    return () => {
      unsubUser();
      unsubLogs();
      unsubSeat(); 
    };
    
  // 🚨 의존성 배열에 setViewMode 추가 (버그 방지용)
  }, [user, setViewMode]);

  // 💡 로그의 영어 action 코드를 예쁜 한글로 바꿔주는 마법의 번역기
  const getActionBadge = (action) => {
    switch (action) {
      case 'RESERVE': return { text: '✅ 예약 성공', color: '#2563eb', bg: '#eff6ff' };
      case 'CHECK_IN': return { text: '📲 입실 완료', color: '#16a34a', bg: '#f0fdf4' };
      case 'RETURN': return { text: '👋 정상 퇴실', color: '#475569', bg: '#f8fafc' };
      case 'NO_SHOW_CANCEL': return { text: '🚨 노쇼 취소', color: '#dc2626', bg: '#fee2e2' };
      case 'FORCE_EVICT': return { text: '❌ 강제 퇴실', color: '#991b1b', bg: '#fef2f2' };
      case 'AUTO_CHECKOUT': return { text: '⏳ 자동 퇴실', color: '#d97706', bg: '#fef3c7' }; // 새로 추가
      default: return { text: `기타 (${action})`, color: '#64748b', bg: '#f1f5f9' };
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px', fontWeight: 'bold', color: '#64748b' }}>데이터를 불러오는 중입니다... ⏳</div>;

  return (
    <div style={{ padding: window.innerWidth < 600 ? '10px' : '30px 20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#0f172a', fontWeight: '700', margin: 0 }}>마이페이지</h1>
      </div>

      {/* 🚨 딱 여기에 넣어주세요! (그러면 맨 위 import에 불이 들어옵니다) */}
      <QRCodeGen studentId={user?.studentNo || user?.email?.split('@')[0] || "학번없음"} />

      {/* 1️⃣ 내 패널티 상태 카드 */}
      <div style={{ 
        background: '#fff', padding: '30px', borderRadius: '25px', marginBottom: '30px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#1e293b' }}>나의 패널티 현황</h2>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '15px', textAlign: 'center', minWidth: '200px' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', fontWeight: 'bold' }}>현재 노쇼 누적</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '2rem',  fontWeight: '900', color: userData?.penaltyCount >= 2 ? '#dc2626' : '#2563eb' }}>
              {userData?.penaltyCount || 0} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ 3회</span>
            </p>
          </div>
          
          <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '15px', textAlign: 'center', minWidth: '200px' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', fontWeight: 'bold' }}>예약 정지 해제일</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '1.1rem', fontWeight: '900', color: userData?.penaltyUntil ? '#dc2626' : '#16a34a' }}>
              {userData?.penaltyUntil 
                ? new Date(userData.penaltyUntil.toDate()).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                : '정지 내역 없음'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ 
        background: '#fff', padding: '30px', borderRadius: '25px', 
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#1e293b' }}>최근 이용 이력</h2>
        
        {(() => {
          const dailyData = {};
          
          logs
            // 💡 끝난 이용 기록(RETURN, AUTO_CHECKOUT)만 가져옵니다.
            .filter(log => log.action === 'RETURN' || log.action === 'AUTO_CHECKOUT')
            .forEach((log) => {
              // 1️⃣ 날짜 구하기 로직 (동일)
              const logDate = (log.timestamp || log.createdAt)?.toDate ? (log.timestamp || log.createdAt).toDate() : new Date();
              const year = logDate.getFullYear();
              const month = logDate.getMonth() + 1;
              const date = logDate.getDate();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const day = dayNames[logDate.getDay()];
              const dateString = `${year}년 ${month}월 ${date}일 ${day}요일`;
              
              // 🚨 2️⃣ [여기가 핵심!] 복잡한 계산식 다 지우고, DB에 있는 진짜 사용 시간만 쏙 빼옵니다.
              let actualMinutes = log.usedMinutes || 0;

              // (마이너스 방지 - 혹시 모르니 남겨둡니다)
              if (actualMinutes < 0) actualMinutes = 0;

              // 3️⃣ 바구니에 차곡차곡 담기
              if (!dailyData[dateString]) {
                dailyData[dateString] = { totalMinutes: 0, sortKey: logDate.getTime() };
              }
              dailyData[dateString].totalMinutes += actualMinutes;
            });

          const groupedLogs = Object.entries(dailyData)
            .sort(([, a], [, b]) => b.sortKey - a.sortKey)
            .map(([dateString, data]) => ({ dateString, totalMinutes: data.totalMinutes }));

          if (groupedLogs.length === 0) {
            return <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontWeight: 'bold' }}>아직 도서관 이용 기록이 없습니다.</p>;
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '500px', overflowY: 'auto' }}>
              {groupedLogs.map((item, index) => {
                // 🚨 분(m)을 시(h)와 분(m)으로 예쁘게 쪼개기
                const h = Math.floor(item.totalMinutes / 60); 
                const m = item.totalMinutes % 60;             

                let durationText = '';
                if (h > 0) durationText += `${h}시간 `;
                if (m > 0) durationText += `${m}분`;
                durationText = durationText.trim() || '1분 미만'; // 너무 짧으면 1분 미만으로 표시

                return (
                  <div key={index} style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '18px 20px', background: '#f8fafc', borderRadius: '15px',
                    marginBottom: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>
                      {item.dateString}
                    </div>
                    <div style={{ 
                      background: '#eff6ff', color: '#2563eb', padding: '8px 16px', 
                      borderRadius: '20px', fontWeight: '900', fontSize: '0.95rem'
                    }}>
                      {durationText} 이용
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default MyPage;