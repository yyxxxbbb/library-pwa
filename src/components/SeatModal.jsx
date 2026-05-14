import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast } from 'date-fns';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleLibraryAction } from '../api/libraryService'; 
import { ReportSubmitModal } from './ReportModule';

export default function SeatModal({
  selectedSeat, setSelectedSeat, user, isAdmin,
  selectedDate, setSelectedDate, startTime, endTime
}) {
  const [activeTab, setActiveTab] = useState('RESERVE');
  const [seatHistory, setSeatHistory] = useState([]);
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [showAgreement, setShowAgreement] = useState(false);
  
  const [currentReservation, setCurrentReservation] = useState(null);

  // 1. 좌석 히스토리 및 현재 예약 정보 불러오기
  useEffect(() => {
    if (!selectedSeat || !selectedDate) return;
    
    // 히스토리
    const historyQ = query(collection(db, 'Log'), where('seatId', '==', selectedSeat.id));
    const unsubHistory = onSnapshot(historyQ, snap => {
      setSeatHistory(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
    });

    // 현재 선택한 시간대의 예약 내역 확인 (시간 겹침 계산)
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const resQ = query(collection(db, 'Reservations'), where('seatId', '==', selectedSeat.id), where('date', '==', dateStr));
    const unsubRes = onSnapshot(resQ, snap => {
      const found = snap.docs.find(d => {
        const res = d.data();
        if (res.status === 'RETURNED') return false;
        // 시간이 조금이라도 겹치는지 확인
        return startTime < res.endTime && endTime > res.startTime;
      });
      if (found) setCurrentReservation({ id: found.id, ...found.data() });
      else setCurrentReservation(null);
    });

    return () => { unsubHistory(); unsubRes(); };
  }, [selectedSeat, selectedDate, startTime, endTime]);

  // 🔥 [핵심 보완] 내 예약인지 확인하는 로직 강화 (이메일 및 학번 모두 체크하여 취소 불가 에러 해결)
  const isMyReservation = currentReservation && user && (
    currentReservation.userId === user.email || 
    currentReservation.userId?.split('@')[0] === user.email?.split('@')[0] ||
    currentReservation.studentNo === user.email?.split('@')[0]
  );

  // 🔴 [관리자 전용 기능]
  const adminAction = async (type) => {
    try {
      if (type === 'DISABLE') {
        if (!window.confirm("이 좌석을 '점검 중(비활성화)' 상태로 변경하시겠습니까?")) return;
        await updateDoc(doc(db, "Seat", selectedSeat.id), { status: "DISABLED" });
        alert("✅ 좌석이 비활성화되었습니다.");
      } else if (type === 'ENABLE') {
        if (!window.confirm("이 좌석을 다시 활성화하시겠습니까?")) return;
        await updateDoc(doc(db, "Seat", selectedSeat.id), { status: "AVAILABLE" });
        alert("✅ 좌석이 활성화되었습니다.");
      } else if (type === 'FORCE_CANCEL') {
        if (!window.confirm("[관리자 권한] 해당 예약을 강제로 취소하시겠습니까?")) return;
        await deleteDoc(doc(db, "Reservations", currentReservation.id));
        await addDoc(collection(db, "Log"), { action: "FORCE_CANCEL", seatId: selectedSeat.id, uid: currentReservation.userId, adminId: user.email, createdAt: serverTimestamp() });
        alert("🚨 예약이 강제 취소되었습니다.");
      } else if (type === 'FORCE_EVICT') {
        if (!window.confirm("[관리자 권한] 해당 사용자를 강제로 퇴실 처리하시겠습니까?")) return;
        await updateDoc(doc(db, "Reservations", currentReservation.id), { status: "RETURNED" });
        await addDoc(collection(db, "Log"), { action: "FORCE_EVICT", seatId: selectedSeat.id, uid: currentReservation.userId, adminId: user.email, createdAt: serverTimestamp() });
        alert("🚨 사용자가 강제 퇴실 처리되었습니다.");
      }
      setSelectedSeat(null);
    } catch (e) {
      console.error(e);
      alert("관리자 작업 중 오류가 발생했습니다.");
    }
  };

  // 🟡 [일반 사용자 기능]
  const userAction = async (type) => {
    try {
      if (type === 'CANCEL') {
        if (!window.confirm("예약을 취소하시겠습니까?")) return;
        await deleteDoc(doc(db, "Reservations", currentReservation.id));
        await addDoc(collection(db, "Log"), { action: "CANCEL", seatId: selectedSeat.id, uid: user.email, createdAt: serverTimestamp() });
        alert("✅ 예약이 취소되었습니다.");
      } else if (type === 'RETURN') {
        if (!window.confirm("정말 퇴실하시겠습니까? 남은 이용 시간은 모두 소멸됩니다.")) return;
        await updateDoc(doc(db, "Reservations", currentReservation.id), { status: "RETURNED" });
        await addDoc(collection(db, "Log"), { action: "RETURN", seatId: selectedSeat.id, uid: user.email, usedMinutes: 60, createdAt: serverTimestamp() });
        alert("👋 정상적으로 퇴실 처리되었습니다.");
      }
      setSelectedSeat(null);
    } catch (e) {
      console.error(e);
      alert("작업 중 오류가 발생했습니다.");
    }
  };

  const handleReportSubmit = async () => {
    if (!reportDetails.trim()) return alert("상황을 입력해주세요.");
    try {
      await addDoc(collection(db, "Log"), {
        action: 'USER_REPORTED', 
        seatId: selectedSeat.id, 
        seatLabel: selectedSeat.label || selectedSeat.id,
        uid: reportTarget.uid || reportTarget,
        studentNo: reportTarget.studentNo || reportTarget.uid || reportTarget,
        reporter: user.email, 
        result: reportCategory,
        reportDetails: reportDetails,
        createdAt: serverTimestamp()
      });
      alert("✅ 신고가 접수되었습니다.");
      setShowReportPopup(false);
    } catch(e) { 
      console.error(e);
      alert("오류가 발생했습니다."); 
    }
  };

  const handleReserveConfirm = async () => {
    setShowAgreement(false); 
    await handleLibraryAction({
      actionType: 'RESERVED',
      seat: selectedSeat,
      user,
      isAdmin,
      selectedDate,
      startTime,
      endTime,
      setSelectedSeat
    });
  };

  if (!selectedSeat) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '600px', height: '80vh', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '30px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
        
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <div>
            <span style={{ color: '#2563eb', fontWeight: '900', fontSize: '0.9rem', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px' }}>좌석 정보</span>
            <h2 style={{ margin: '10px 0 0 0', fontSize: '2.2rem', fontWeight: '900', color: '#000000' }}>{selectedSeat.label}</h2>
          </div>
          <button onClick={() => setSelectedSeat(null)} style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: '900', color: '#000000', cursor: 'pointer' }}>✕</button>
        </div>

        {/* 탭 버튼 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', background: '#f8fafc', padding: '5px', borderRadius: '14px' }}>
          <button onClick={() => {setActiveTab('RESERVE'); setShowAgreement(false);}} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: activeTab === 'RESERVE' ? '#fff' : 'transparent', color: activeTab === 'RESERVE' ? '#000000' : '#333333', fontWeight: '900', cursor: 'pointer', boxShadow: activeTab === 'RESERVE' ? '0 2px 10px rgba(0,0,0,0.05)' : 'none' }}>예약 및 상태</button>
          <button onClick={() => setActiveTab('HISTORY')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: activeTab === 'HISTORY' ? '#fff' : 'transparent', color: activeTab === 'HISTORY' ? '#000000' : '#333333', fontWeight: '900', cursor: 'pointer', boxShadow: activeTab === 'HISTORY' ? '0 2px 10px rgba(0,0,0,0.05)' : 'none' }}>이용 내역 및 신고</button>
        </div>

        {activeTab === 'RESERVE' ? (
          <div>
            {!showAgreement ? (
              <>
                <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '16px', marginBottom: '25px', border: '1px solid #bfdbfe' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#1e3a8a', fontWeight: '800' }}>선택된 시간</p>
                  <h3 style={{ margin: 0, color: '#1d4ed8', fontSize: '1.4rem', fontWeight: '900' }}>{format(selectedDate, 'MM월 dd일')} {startTime} ~ {endTime}</h3>
                </div>

                {/* 🔥 상태별 UI 분기 (핵심 로직) */}
                {selectedSeat.status === 'DISABLED' ? (
                  <div style={{ textAlign: 'center', padding: '20px', background: '#fee2e2', borderRadius: '16px' }}>
                    <h3 style={{ color: '#dc2626', margin: 0, fontWeight: '900' }}>🚫 점검 중인 좌석입니다.</h3>
                    {isAdmin && (
                      <button onClick={() => adminAction('ENABLE')} style={{ width: '100%', padding: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', marginTop: '15px', cursor: 'pointer' }}>
                        ✅ 점검 해제(좌석 활성화)
                      </button>
                    )}
                  </div>
                ) : currentReservation ? (
                  <div style={{ textAlign: 'center', padding: '20px', background: '#f1f5f9', borderRadius: '16px' }}>
                    {/* 내 예약인 경우 */}
                    {isMyReservation ? (
                      <>
                        <h3 style={{ color: '#2563eb', margin: '0 0 15px 0', fontWeight: '900' }}>💡 본인이 예약/사용 중인 좌석입니다.</h3>
                        <button onClick={() => userAction(currentReservation.status === 'OCCUPIED' ? 'RETURN' : 'CANCEL')} style={{ width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>
                          {currentReservation.status === 'OCCUPIED' ? '👋 즉시 퇴실하기' : '🗑️ 내 예약 취소하기'}
                        </button>
                      </>
                    ) : (
                      /* 다른 사람의 예약인 경우 */
                      <>
                        <h3 style={{ color: '#475569', margin: '0 0 10px 0', fontWeight: '900' }}>🔒 다른 사용자가 이용 중입니다.</h3>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.95rem', fontWeight: '700', color: '#64748b' }}>
                          이용자: {currentReservation.studentNo || currentReservation.userId?.split('@')[0]}
                        </p>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => adminAction('FORCE_CANCEL')} style={{ flex: 1, padding: '14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>예약 취소</button>
                            {currentReservation.status === 'OCCUPIED' && (
                              <button onClick={() => adminAction('FORCE_EVICT')} style={{ flex: 1, padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>강제 퇴실</button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  /* 아무도 예약하지 않은 빈 자리인 경우 */
                  <>
                    <button onClick={() => setShowAgreement(true)} style={{ width: '100%', padding: '18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 10px 25px rgba(37,99,235,0.3)' }}>예약 진행하기</button>
                    {isAdmin && (
                      <button onClick={() => adminAction('DISABLE')} style={{ width: '100%', padding: '16px', background: '#475569', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', marginTop: '15px', cursor: 'pointer' }}>
                        🚫 좌석 비활성화(점검 처리)
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              /* 규칙 동의 UI */
              <div style={{ background: '#fff', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: '3rem', marginBottom: '10px', textAlign: 'center' }}>⚠️</div>
                <h3 style={{ margin: '0 0 15px 0', color: '#dc2626', fontWeight: '900', fontSize: '1.4rem', textAlign: 'center' }}>이용 규칙 동의</h3>
                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '16px', border: '1px solid #fecaca', marginBottom: '25px', width: '100%', textAlign: 'left', boxSizing: 'border-box' }}>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#7f1d1d', fontWeight: '800', lineHeight: '1.5' }}>
                    1. 타인의 이용을 방해하는 행위(소음, 자리 사석화 등) 적발 시 <span style={{color: '#dc2626', fontWeight:'900'}}>즉시 강제 퇴실</span> 조치됩니다.
                  </p>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#7f1d1d', fontWeight: '800', lineHeight: '1.5' }}>
                    2. 타 사용자의 신고가 누적되거나 수차례 규칙 위반 적발 시, 규정에 따라 <span style={{color: '#dc2626', fontWeight:'900'}}>강력한 이용 정지(누적 패널티)</span>가 부과됩니다.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: '#7f1d1d', fontWeight: '900', lineHeight: '1.5', textAlign: 'center', marginTop: '15px' }}>
                    위 규칙에 완벽히 동의하셔야 예약이 가능합니다.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowAgreement(false)} style={{ flex: 1, padding: '16px', background: '#e2e8f0', color: '#000000', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>뒤로가기</button>
                  <button onClick={handleReserveConfirm} style={{ flex: 2, padding: '16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 8px 20px rgba(220, 38, 38, 0.3)' }}>동의하고 예약 확정</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 이용 내역 및 신고 탭 */
          <div>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: '900', color: '#000000' }}>최근 이용 내역</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {seatHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontWeight: '700' }}>최근 이용 내역이 없습니다.</div>
              ) : seatHistory.map((session, idx) => {
                const isAbnormal = session.action !== 'RETURN' && session.action !== 'CHECK_IN' && session.action !== 'COMPLETED';
                return (
                  <div key={idx} style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ background: isAbnormal ? '#fee2e2' : '#e0e7ff', color: isAbnormal ? '#dc2626' : '#4f46e5', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '900', display: 'inline-block', marginBottom: '8px' }}>
                          {session.action === 'RETURN' ? '정상 퇴실' : (session.action === 'CHECK_IN' ? '✅ 사용 중' : '⏳ 시스템 기록')}
                        </span>
                        <h4 style={{ margin: 0, fontWeight: '900', color: '#000000' }}>{session.studentNo || session.uid?.split('@')[0]}</h4>
                      </div>
                      <button onClick={() => { setReportTarget(session); setShowReportPopup(true); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>
                        {isAdmin ? '🚨 관리자 즉시 조치' : '🚨 신고 접수'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <ReportSubmitModal isOpen={showReportPopup} onClose={() => setShowReportPopup(false)} reportTarget={reportTarget} selectedSeat={selectedSeat} reporterEmail={user?.email} />
          </div>
        )}
      </div>
    </div>
  );
}