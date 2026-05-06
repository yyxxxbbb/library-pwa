import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast } from 'date-fns';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function SeatModal({
  selectedSeat, setSelectedSeat, user, isAdmin,
  selectedDate, setSelectedDate, startTime, endTime, 
  showFullCalendar, setShowFullCalendar
}) {
  const [activeTab, setActiveTab] = useState('RESERVE');
  
  // 이용 내역 및 신고 관련 상태
  const [seatHistory, setSeatHistory] = useState([]);
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');

  // 📅 1. 한 달 달력 렌더링 로직
  const renderCalendar = () => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
        {['일','월','화','수','목','금','토'].map(d => <div key={d} style={{ textAlign:'center', fontWeight:'900', color:'#94a3b8', fontSize:'0.8rem', paddingBottom: '10px' }}>{d}</div>)}
        {calendarDays.map((day, i) => (
          <button
            key={i}
            disabled={isPast(day) && !isSameDay(day, new Date())}
            onClick={() => { setSelectedDate(day); setShowFullCalendar(false); }}
            style={{
              padding: '12px 0', border: 'none', borderRadius: '10px', cursor: 'pointer', transition: '0.2s',
              background: isSameDay(day, selectedDate) ? '#2563eb' : (isSameMonth(day, monthStart) ? '#f8fafc' : 'transparent'),
              color: isSameDay(day, selectedDate) ? '#fff' : (isPast(day) && !isSameDay(day, new Date()) ? '#cbd5e1' : '#1e293b'),
              fontWeight: '800', fontSize: '0.95rem', opacity: isSameMonth(day, monthStart) ? 1 : 0.3
            }}
          >
            {format(day, 'd')}
          </button>
        ))}
      </div>
    );
  };

  // 🚨 2. 이용 내역 불러오기 로직 (이름 마스킹 포함)
  useEffect(() => {
    if (!selectedSeat || activeTab !== 'HISTORY') return;

    const q = query(collection(db, 'Log'), where('seatId', '==', selectedSeat.id));
    const unsub = onSnapshot(q, async (snap) => {
      const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(log => ['RETURN', 'AUTO_CHECKOUT', 'FORCE_EVICT', 'CHECK_IN'].includes(log.action))
        .sort((a, b) => {
          const timeA = (a.timestamp || a.createdAt)?.toDate ? (a.timestamp || a.createdAt).toDate().getTime() : 0;
          const timeB = (b.timestamp || b.createdAt)?.toDate ? (b.timestamp || b.createdAt).toDate().getTime() : 0;
          return timeB - timeA;
        });

      const uniqueUsers = new Set();
      const logsWithNames = [];

      for (const log of rawLogs) {
        const targetId = log.uid?.split('@')[0] || log.studentNo;
        if (!targetId || uniqueUsers.has(targetId)) continue; 
        
        uniqueUsers.add(targetId);
        let realName = '이름 없음';

        try {
          const userDoc = await getDoc(doc(db, 'User', targetId));
          if (userDoc.exists() && userDoc.data().name) realName = userDoc.data().name;
        } catch (error) { console.error("이름 가져오기 실패", error); }
        
        logsWithNames.push({ ...log, realName });
      }

      setSeatHistory(logsWithNames);
    });

    return () => unsub();
  }, [selectedSeat, activeTab]);

  // 개인정보 마스킹 함수
  const maskName = (name) => {
    if (!name || name === '이름 없음') return '이름 없음';
    if (name.length <= 2) return name[0] + '*';
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  };
  const maskId = (id) => id ? id.substring(0, 4) + '****' : '';

  // ✅ 3. 예약 확정 처리
  const handleFinalReserve = async () => {
    if(selectedSeat.status === 'RESERVED' || selectedSeat.status === 'OCCUPIED') {
       return alert("🚨 현재 시간대에 이미 예약이 있거나 사용 중인 좌석입니다.");
    }

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      await addDoc(collection(db, "Reservations"), {
        seatId: selectedSeat.id, userId: user.email, date: dateStr, startTime, endTime, status: 'RESERVED', createdAt: serverTimestamp()
      });
      await addDoc(collection(db, "Log"), {
        action: 'RESERVE', seatId: selectedSeat.id, seatLabel: selectedSeat.id, uid: user.email, result: '시간 지정 예약 완료', createdAt: serverTimestamp()
      });
      alert(`🎉 예약이 완료되었습니다!\n[${format(selectedDate, 'M월 d일')} ${startTime} ~ ${endTime}]`);
      setSelectedSeat(null);
    } catch (error) {
      alert("🚨 예약 처리 중 문제가 발생했습니다.");
    }
  };

  // 🚨 4. 신고 및 패널티 처리
  const handleReportSubmit = async () => {
    if (!reportReason) return alert("🚨 사유를 선택해주세요!");
    try {
      const targetUserId = reportTarget.uid || reportTarget.studentNo;
      const targetIdPlain = targetUserId.includes('@') ? targetUserId.split('@')[0] : targetUserId;

      if (isAdmin) {
        const userRef = doc(db, "User", targetIdPlain);
        await updateDoc(userRef, { penaltyCount: increment(1) });
        await addDoc(collection(db, "Log"), {
          action: 'ADMIN_PENALTY', seatId: selectedSeat.id, seatLabel: selectedSeat.id, uid: targetUserId, result: reportReason, createdAt: serverTimestamp()
        });
        alert(`✅ [${reportTarget.realName}] 사용자에게 패널티 1회가 즉시 부과되었습니다.`);
      } else {
        await addDoc(collection(db, "Log"), {
          action: 'USER_REPORTED', seatId: selectedSeat.id, seatLabel: selectedSeat.id, uid: targetUserId, reporter: user.email, result: reportReason, createdAt: serverTimestamp()
        });
        alert(`✅ 신고가 정상적으로 접수되었습니다. 관리자 검토 후 조치됩니다.`);
      }

      setShowReportPopup(false);
      setReportReason('');
      setReportTarget(null);
    } catch (error) {
      alert("🚨 처리 중 오류가 발생했습니다.");
    }
  };

  return (
    <>
      {/* 📅 달력 모달 */}
      {showFullCalendar && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{format(selectedDate, 'yyyy년 M월')}</h3>
              <button onClick={() => setShowFullCalendar(false)} style={{ border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', color: '#475569' }}>✕</button>
            </div>
            {renderCalendar()}
          </div>
        </div>
      )}

      {/* 🚨 신고 모달 */}
      {showReportPopup && reportTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', fontWeight: '900', color: '#dc2626' }}>
              {isAdmin ? '🚨 패널티 즉시 부과' : '🚨 좌석 사용자 신고'}
            </h3>
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 5px 0', color: '#475569', fontSize: '0.9rem', fontWeight: 'bold' }}>좌석: {selectedSeat.id}</p>
              <p style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem', fontWeight: '900' }}>
                대상: {isAdmin ? reportTarget.realName : maskName(reportTarget.realName)} ({isAdmin ? (reportTarget.uid?.split('@')[0] || reportTarget.studentNo) : maskId(reportTarget.uid?.split('@')[0] || reportTarget.studentNo)})
              </p>
            </div>
            
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1e293b' }}>사유 선택</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '25px' }}>
              {['자리 쓰레기 방치', '도서관 기물 파손', '장시간 이석 및 짐만 두기', '심한 소음 유발'].map(reason => (
                <button 
                  key={reason} onClick={() => setReportReason(reason)} 
                  style={{ padding: '14px', borderRadius: '12px', border: `2px solid ${reportReason === reason ? '#dc2626' : '#e2e8f0'}`, background: reportReason === reason ? '#fef2f2' : '#fff', color: reportReason === reason ? '#dc2626' : '#475569', fontWeight: '800', cursor: 'pointer', transition: '0.2s', textAlign: 'left' }}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowReportPopup(false)} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#64748b', fontWeight: '900', cursor: 'pointer' }}>취소</button>
              <button onClick={handleReportSubmit} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: '900', cursor: 'pointer' }}>
                {isAdmin ? '즉시 패널티 부과' : '신고 접수'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 메인 예약/내역 모달 */}
      {selectedSeat && !showFullCalendar && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '900', color: '#0f172a' }}>{selectedSeat.id} 좌석</h2>
              <button onClick={() => setSelectedSeat(null)} style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', color: '#475569' }}>✕</button>
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', padding: '6px', borderRadius: '14px', marginBottom: '25px' }}>
              <button onClick={() => setActiveTab('RESERVE')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer', transition: '0.2s', background: activeTab === 'RESERVE' ? '#fff' : 'transparent', color: activeTab === 'RESERVE' ? '#2563eb' : '#64748b', boxShadow: activeTab === 'RESERVE' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>📅 예약 확정</button>
              <button onClick={() => setActiveTab('HISTORY')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer', transition: '0.2s', background: activeTab === 'HISTORY' ? '#fff' : 'transparent', color: activeTab === 'HISTORY' ? '#dc2626' : '#64748b', boxShadow: activeTab === 'HISTORY' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>🚨 이용 내역/신고</button>
            </div>

            {activeTab === 'RESERVE' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '16px', border: '2px solid #e2e8f0', marginBottom: '25px' }}>
                  <p style={{ margin: '0 0 5px 0', fontWeight: '800', color: '#64748b', fontSize: '0.95rem' }}>선택하신 날짜</p>
                  <p style={{ margin: '0 0 20px 0', fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{format(selectedDate, 'yyyy년 M월 d일')}</p>
                  <div style={{ height: '1px', background: '#e2e8f0', margin: '0 0 20px 0' }}></div>
                  <p style={{ margin: '0 0 5px 0', fontWeight: '800', color: '#64748b', fontSize: '0.95rem' }}>이용 희망 시간</p>
                  <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: '900', color: '#2563eb' }}>{startTime} ~ {endTime}</p>
                </div>
                
                <button 
                  onClick={handleFinalReserve} 
                  style={{ width: '100%', padding: '18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.3s', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)' }}
                >
                  이 시간으로 예약하기
                </button>
              </div>
            )}

            {activeTab === 'HISTORY' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {seatHistory.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontWeight: 'bold' }}>최근 이용 내역이 없습니다.</p>
                ) : (
                  seatHistory.map((session, idx) => {
                    const timeObj = session.timestamp || session.createdAt;
                    const endTimeStr = timeObj?.toDate ? timeObj.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '알 수 없음';
                    const isAbnormal = session.action === 'AUTO_CHECKOUT' || session.action === 'FORCE_EVICT';
                    const displayName = isAdmin ? session.realName : maskName(session.realName);
                    const displayId = isAdmin ? (session.uid?.split('@')[0] || session.studentNo) : maskId(session.uid?.split('@')[0] || session.studentNo);

                    return (
                      <div key={idx} style={{ background: '#f8fafc', border: `2px solid ${isAbnormal ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '16px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
                        {isAbnormal && <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#dc2626' }}></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <div>
                            <span style={{ background: isAbnormal ? '#fee2e2' : '#e0e7ff', color: isAbnormal ? '#dc2626' : '#4f46e5', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '900', display: 'inline-block', marginBottom: '8px' }}>
                              {session.action === 'RETURN' ? '정상 퇴실' : (session.action === 'CHECK_IN' ? '✅ 현재 사용 중' : '⏳ 비정상 퇴실')}
                            </span>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: '900' }}>
                              {displayName} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>({displayId})</span>
                            </h4>
                          </div>
                          <button onClick={() => { setReportTarget(session); setShowReportPopup(true); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>
                            {isAdmin ? '🚨 즉시 조치' : '🚨 신고'}
                          </button>
                        </div>
                        <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '0.85rem', fontWeight: '700' }}>기록 시간: {endTimeStr}</p>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}