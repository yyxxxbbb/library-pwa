import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore'; 
import { format, addDays, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

// 1. 공통 및 본인(상열님) 모듈
import MyPage from './pages/MyPage';
import ScannerPage from './pages/Scanner';
import SeatModal from './components/SeatModal';
import Auth from './pages/Auth';
import FloorMap from './components/FloorMap';
import AdminDashboard from './pages/AdminDashboard';
import QRCodeGen from './components/QRCodeGen'; 

// 2. 팀원 A (이벤트 & 랭킹 기능)
import EventBanner from './components/EventBanner';
import EventBoard from './pages/EventBoard';
import EventDetail from './pages/EventDetail';
import AdminEvents from './pages/AdminEvents';
import RankingPage from './pages/RankingPage';
import RankingBanner from './components/RankingBanner';

// 3. 팀원 B (신고 소명 및 커스텀 UI)
import { PenaltyAppealModal } from './components/ReportModule';

import { useLibraryData } from './hooks/useLibraryData';
import { useUserSession } from './hooks/useUserSession';

const getNotificationText = (action, seatLabel) => {
  const label = seatLabel || '좌석';
  switch (action) {
    case 'RESERVE': return `✅ ${label} 예약 완료`;
    case 'CANCEL': return `🗑️ ${label} 예약 취소`;
    case 'NO_SHOW_CANCEL': return `🚨 ${label} 미입실 취소`;
    case 'CHECK_IN': return `📲 ${label} 입실 확인`;
    case 'RETURN': return `👋 ${label} 퇴실 처리`;
    case 'AUTO_CHECKOUT': return `⏳ ${label} 자동 퇴실`;
    case 'FORCE_EVICT': return `❌ ${label} 관리자 강제 퇴실`;
    default: return `🔔 새로운 알림이 있습니다.`;
  }
};

const timeOptions = [...Array(28).keys()].map(i => {
  const h = Math.floor(i / 2) + 9;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, '0')}:${m}`;
});

const getDefaultTimes = () => {
  const now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();
  
  if (h < 9) return { start: "09:00", end: "11:00" };
  if (h >= 21) return { start: "20:30", end: "22:30" };
  
  const mins = m >= 30 ? "30" : "00";
  const start = `${String(h).padStart(2, '0')}:${mins}`;
  const end = `${String(h + 2).padStart(2, '0')}:${mins}`;
  
  return { start, end };
};

export default function App() {
  const { seats, user, currentUserData } = useLibraryData();
  useUserSession(user); 

  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자']; 
  const isAdmin = user && user.email && ADMIN_IDS.includes(user.email.split('@')[0]);

  const [systemSettings, setSystemSettings] = useState(null);
  
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSystemSettings(data);
        if (data.isExamActive && data.examEndDate && new Date() > new Date(data.examEndDate)) {
          updateDoc(doc(db, 'System', 'settings'), { isExamActive: false });
        }
      }
    });
    return () => unsub();
  }, []);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 950; 
  const isSmallMobile = windowWidth < 600;

  const [activeFloor, setActiveFloor] = useState('1층');
  const [viewMode, setViewMode] = useState('MAP');

  // 팀원 기능 상태
  const [showRankingBanner, setShowRankingBanner] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  useEffect(() => {
    if (user && !isAdmin && (viewMode === 'USERS' || viewMode === 'SCANNER' || viewMode === 'EVENTS_ADMIN')) {
      setViewMode('MAP');
    }
  }, [user, isAdmin, viewMode]);

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastReadTime, setLastReadTime] = useState(() => parseInt(localStorage.getItem(`lastRead_${user?.email}`) || '0', 10));

  const [showSeatQR, setShowSeatQR] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);

  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  
  // 팀원 C의 UI 개선 적용 (드롭다운)
  const [startTime, setStartTime] = useState(getDefaultTimes().start);
  const [endTime, setEndTime] = useState(getDefaultTimes().end);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);

  const [penaltyAlert, setPenaltyAlert] = useState(null);

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfDay(new Date()), i));

  const [mapReservations, setMapReservations] = useState([]);
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const q = query(collection(db, 'Reservations'), where('date', '==', dateStr));
    const unsub = onSnapshot(q, snap => setMapReservations(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [selectedDate]);

  const [myActiveTickets, setMyActiveTickets] = useState([]);
  useEffect(() => {
    if (!user) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const q = query(collection(db, 'Reservations'), where('userId', '==', user.email), where('date', '==', todayStr));
    const unsub = onSnapshot(q, snap => setMyActiveTickets(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [user]);

  const [currentTimeString, setCurrentTimeString] = useState(new Date().toTimeString().substring(0, 5));
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeString(new Date().toTimeString().substring(0, 5)), 60000);
    return () => clearInterval(timer);
  }, []);

  const displaySeats = seats.map(seat => {
    if (seat.status === 'DISABLED') return seat; 
    const overlappingRes = mapReservations.find(res => {
      if (res.seatId !== seat.id || res.status === 'RETURNED') return false;
      return startTime < res.endTime && endTime > res.startTime;
    });
    if (overlappingRes) {
      return { 
        ...seat, 
        status: overlappingRes.status,
        studentNo: overlappingRes.studentNo,
        userId: overlappingRes.userId,
        userName: overlappingRes.studentNo || overlappingRes.userId?.split('@')[0]
      }; 
    }
    return { ...seat, status: 'AVAILABLE' };
  });

  const myTicket = myActiveTickets.find(res => res.endTime >= currentTimeString && res.status !== 'RETURNED');

  // 팀원 신고 및 소명 알림 로직
  useEffect(() => {
    if (!user) return;
    const currentId = user.email?.split('@')[0];
    const isAdminUser = ['pjy', 'admin', 'manager', '1111111', '관리자'].includes(currentId);

    const unsub = onSnapshot(collection(db, 'Log'), (snap) => {
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filtered = logs.filter(log => {
        const isMe = log.uid === user.email || log.studentNo === currentId;
        const isPending = log.reportStatus === 'PENDING' || log.action === 'USER_REPORTED';
        const isProcessing = log.reportStatus === 'PROCESSING' || log.action === 'ADMIN_PENALTY';
        const isAdminNotification = isAdminUser && (isPending || (isProcessing && log.appealText));
        return isMe || isAdminNotification;
      });
      setNotifications(filtered);
    });
    return () => unsub();
  }, [user]);

  const pendingReportsCount = isAdmin ? notifications.filter(n => n.action === 'USER_REPORTED').length : 0;

  useEffect(() => {
    if (!user || isAdmin || notifications.length === 0) return; 
    if (penaltyAlert && penaltyAlert.id === 'test_123') return;

    const myId = user.email.split('@')[0];
    const readKey = `read_penalties_${myId}`;
    const readPenalties = JSON.parse(localStorage.getItem(readKey) || '[]');

    const unreadAlert = notifications.find(n => n.action === 'ADMIN_PENALTY' && !readPenalties.includes(n.id));
    if (unreadAlert && (!penaltyAlert || penaltyAlert.id !== unreadAlert.id)) {
      setPenaltyAlert(unreadAlert);
    }
  }, [notifications, user, isAdmin, penaltyAlert]);

  const handleDismissPenalty = () => {
    if (!penaltyAlert) return;
    const myId = user.email.split('@')[0];
    const readKey = `read_penalties_${myId}`;
    const readPenalties = JSON.parse(localStorage.getItem(readKey) || '[]');
    
    if (penaltyAlert.id !== 'test_123') {
      readPenalties.push(penaltyAlert.id);
      localStorage.setItem(readKey, JSON.stringify(readPenalties));
    }
    setPenaltyAlert(null);
  };

  const unreadCount = notifications.filter(n => ((n.timestamp || n.createdAt)?.toDate?.().getTime() || 0) > lastReadTime).length;
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      const now = Date.now();
      setLastReadTime(now);
      localStorage.setItem(`lastRead_${user?.email}`, now.toString());
    }
  };

  const openQRModal = () => { setTimeLeft(15); setShowSeatQR(true); };

  useEffect(() => {
    let timer;
    if (showSeatQR) timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [showSeatQR]);

  useEffect(() => {
    if (showSeatQR && timeLeft <= 0) {
      setShowSeatQR(false);
      setTimeout(() => alert("⌛ QR 코드가 만료되었습니다. 다시 시도해주세요."), 50);
    }
  }, [timeLeft, showSeatQR]);

  useEffect(() => {
    if (showSeatQR && myTicket && myTicket.status === 'OCCUPIED') {
      setShowSeatQR(false);
      alert("✅ 관리자 스캐너 인증이 완료되었습니다. (입실 완료)");
    }
  }, [myTicket, showSeatQR]);

  const handleCheckIn = async () => {
    if (currentTimeString < myTicket.startTime) return alert("🚨 아직 예약 시간이 되지 않았습니다!");
    try {
      await updateDoc(doc(db, "Reservations", myTicket.id), { status: "OCCUPIED" });
      await addDoc(collection(db, "Log"), { action: "CHECK_IN", seatId: myTicket.seatId, uid: user.email, createdAt: serverTimestamp() });
      setShowSeatQR(false); 
      alert("✅ 입실 처리되었습니다.");
    } catch (e) { alert("오류 발생"); }
  };

  const handleCheckout = async () => {
    if(!window.confirm("정말 퇴실하시겠습니까? 남은 이용 시간은 모두 소멸됩니다.")) return;
    try {
      await updateDoc(doc(db, "Reservations", myTicket.id), { status: "RETURNED" });
      await addDoc(collection(db, "Log"), { action: "RETURN", seatId: myTicket.seatId, uid: user.email, usedMinutes: 60, createdAt: serverTimestamp() });
      alert("👋 정상적으로 퇴실 처리되었습니다.");
    } catch (e) { alert("오류 발생"); }
  };

  const handleCancel = async () => {
    if(!window.confirm("예약을 취소하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "Reservations", myTicket.id));
      await addDoc(collection(db, "Log"), { action: "CANCEL", seatId: myTicket.seatId, uid: user.email, createdAt: serverTimestamp() });
      alert("🗑️ 예약이 취소되었습니다.");
    } catch (e) { alert("오류 발생"); }
  };

  const handleStartTimeChange = (val) => {
    setStartTime(val);
    if (val >= endTime) {
      const startIdx = timeOptions.indexOf(val);
      if (startIdx < timeOptions.length - 1) setEndTime(timeOptions[startIdx + 1]);
    }
  };

  // 🚀 상열님 핵심 기능 1: 도면 좌석 폭/높이 저장
  const handleUpdateSeats = async (updatedSeats) => {
    try {
      const batch = writeBatch(db);
      updatedSeats.forEach(seat => {
        const seatRef = doc(db, "Seat", seat.id); 
        batch.set(seatRef, { 
          x: seat.x, 
          y: seat.y, 
          label: seat.label,
          width: seat.width ?? 80,   
          height: seat.height ?? 70  
        }, { merge: true });
      });
      await batch.commit();
      console.log("✅ DB에 좌표 및 사이즈 저장 완료!");
    } catch (error) {
      console.error("❌ DB 저장 실패:", error);
      throw error; 
    }
  };

  // 🚀 상열님 핵심 기능 2: 좌석 삭제
  const handleDeleteSeat = async (seatId) => {
    try {
      await deleteDoc(doc(db, "Seat", seatId));
      console.log(`✅ 좌석(${seatId}) DB 삭제 완료`);
    } catch (error) {
      alert("좌석 삭제 중 오류가 발생했습니다.");
    }
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <div key={d} style={{ textAlign:'center', fontWeight:'900', color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#0f172a', fontSize:'0.85rem', paddingBottom: '10px' }}>{d}</div>
        ))}
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDisabled = isPast(day) && !isSameDay(day, new Date());
          return (
            <button key={i} disabled={isDisabled} onClick={() => { setSelectedDate(startOfDay(day)); setShowFullCalendar(false); }} style={{ aspectRatio: '1', border: 'none', borderRadius: '12px', cursor: isDisabled ? 'default' : 'pointer', background: isSelected ? '#2563eb' : 'transparent', color: isSelected ? '#fff' : isDisabled ? '#cbd5e1' : !isCurrentMonth ? '#94a3b8' : '#000000', fontWeight: isSelected ? '900' : '700', fontSize: '1rem' }}>
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    );
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
        {systemSettings?.isExamActive && (
          <div style={{ background: '#ef4444', color: '#fff', padding: '15px 20px', textAlign: 'center', fontWeight: '900', fontSize: '1rem', zIndex: 9999 }}>
            🚨 [시험기간 특별 통제] 현재 예약 및 출입이 제한됩니다.<br/>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>기간: {systemSettings.examStartDate?.replace('T', ' ')} ~ {systemSettings.examEndDate?.replace('T', ' ')}</span>
          </div>
        )}
        <Auth />
      </div>
    );
  }

  const floorTitles = { '1층': '1층 열람실', '2층': '2층 집중구역', '4층': '4층 스터디룸' };

  return (
    <div style={{ padding: isSmallMobile ? '10px' : '20px', width: '100%', maxWidth: '1300px', margin: '0 auto', boxSizing: 'border-box', fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100vh', position: 'relative', paddingBottom: myTicket && viewMode === 'MAP' ? '180px' : '30px' }}>
      
      {!isAdmin && (
        <button 
          onClick={() => setPenaltyAlert({ id: 'test_123', action: 'USER_REPORTED', seatLabel: '테스트 좌석', result: '[단순 노쇼] 1시간 이상 자리를 비웠습니다.' })}
          style={{ position: 'fixed', bottom: '130px', right: '20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '50px', fontWeight: '900', fontSize: '1rem', padding: '15px 20px', cursor: 'pointer', zIndex: 50000, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
          🚨 소명 팝업 테스트
        </button>
      )}

      {showSeatQR && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.85)', zIndex: 100000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', width: '100%', maxWidth: '350px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: '900', color: '#0f172a' }}>📱 QR 입실 인증</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#64748b', fontWeight: '700' }}>관리자 스캐너에 화면을 보여주세요</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <QRCodeGen studentId={user?.email?.split('@')[0]} />
            </div>
            <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '12px', marginBottom: '25px', display: 'inline-block' }}>
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#dc2626' }}>남은 시간: {timeLeft}초</p>
            </div>
            <button onClick={() => setShowSeatQR(false)} style={{ width: '100%', padding: '16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      <PenaltyAppealModal penaltyAlert={penaltyAlert} onDismiss={handleDismissPenalty} userEmail={user?.email} />

      <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', marginBottom: '20px', background: '#fff', padding: '15px 25px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          <h2 onClick={() => setViewMode('MAP')} style={{ margin: 0, color: '#0f172a', fontWeight: '900', fontSize: '1.5rem', whiteSpace: 'nowrap', cursor: 'pointer' }} title="메인 화면으로 이동">📚 스마트 도서관</h2>
          {isAdmin && !isMobile && (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '2px' }}>
              <button onClick={() => setViewMode('MAP')} style={{ padding: '8px 16px', background: viewMode === 'MAP' ? '#2563eb' : 'transparent', color: viewMode === 'MAP' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', transition: '0.2s' }}>배치도</button>
              <button onClick={() => setViewMode('USERS')} style={{ position: 'relative', padding: '8px 16px', background: viewMode === 'USERS' ? '#2563eb' : 'transparent', color: viewMode === 'USERS' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', transition: '0.2s' }}>
                회원관리
                {notifications.some(n => {
                  const isPending = n.reportStatus === 'PENDING' || n.action === 'USER_REPORTED';
                  const isProcessing = n.reportStatus === 'PROCESSING' || n.action === 'ADMIN_PENALTY';
                  return isPending || (isProcessing && n.appealText);
                }) && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '10px', height: '10px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>
                )}
              </button>
              <button onClick={() => setViewMode('SCANNER')} style={{ padding: '8px 16px', background: viewMode === 'SCANNER' ? '#2563eb' : 'transparent', color: viewMode === 'SCANNER' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', transition: '0.2s' }}>입구 스캐너</button>
              <button onClick={() => setViewMode('EVENTS_ADMIN')} style={{ padding: '8px 16px', background: viewMode === 'EVENTS_ADMIN' ? '#16a34a' : 'transparent', color: viewMode === 'EVENTS_ADMIN' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap', transition: '0.2s' }}>이벤트관리</button>
            </div>
          )}
        </div>
        {isAdmin && isMobile && (
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '4px', width: '100%', flexWrap: 'wrap' }}>
            <button onClick={() => setViewMode('MAP')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'MAP' ? '#2563eb' : 'transparent', color: viewMode === 'MAP' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>배치도</button>
            <button onClick={() => setViewMode('USERS')} style={{ position: 'relative', flex: 1, padding: '10px 0', background: viewMode === 'USERS' ? '#2563eb' : 'transparent', color: viewMode === 'USERS' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>
              회원
              {notifications.some(n => {
                  const isPending = n.reportStatus === 'PENDING' || n.action === 'USER_REPORTED';
                  const isProcessing = n.reportStatus === 'PROCESSING' || n.action === 'ADMIN_PENALTY';
                  return isPending || (isProcessing && n.appealText);
                }) && <span style={{ position: 'absolute', top: '4px', right: '8px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>}
            </button>
            <button onClick={() => setViewMode('SCANNER')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'SCANNER' ? '#2563eb' : 'transparent', color: viewMode === 'SCANNER' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>스캐너</button>
            <button onClick={() => setViewMode('EVENTS_ADMIN')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'EVENTS_ADMIN' ? '#16a34a' : 'transparent', color: viewMode === 'EVENTS_ADMIN' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>이벤트</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: isMobile ? 'center' : 'flex-end', width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontWeight: '900', color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>👤 {user?.email?.split('@')[0]}님</p>
          
          <div style={{ position: 'relative' }}>
            <button onClick={toggleNotifications} style={{ background: '#f1f5f9', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#475569" style={{ width: '18px', height: '18px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: '900', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #fff' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {showNotifications && (
              <div style={{ position: 'absolute', top: '45px', right: isMobile ? '-50px' : '0', width: '300px', background: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', zIndex: 1000 }}>
                <div style={{ padding: '15px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '900' }}>새로운 알림</h4><span style={{ fontSize: '0.8rem', cursor: 'pointer', fontWeight: '700' }} onClick={() => setShowNotifications(false)}>닫기 ✕</span></div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '10px' }}>
                  {notifications.length === 0 ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '20px 0', margin: 0, fontWeight: '700' }}>새로운 알림이 없습니다.</p> : notifications.map(noti => (
                    <div key={noti.id} 
                      onClick={() => {
                        if (noti.action === 'USER_REPORTED' || noti.action === 'ADMIN_PENALTY') {
                          setPenaltyAlert(noti);
                          setShowNotifications(false);
                        }
                      }}
                      style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', background: ((noti.timestamp || noti.createdAt)?.toDate?.().getTime() || 0) > lastReadTime ? '#eff6ff' : 'transparent', borderRadius: '8px', cursor: (noti.action === 'USER_REPORTED' || noti.action === 'ADMIN_PENALTY') ? 'pointer' : 'default' }}>
                      <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '700', marginBottom: '4px' }}>
                        {noti.action === 'ADMIN_PENALTY' ? `🚨 [패널티 조치] 사유: ${noti.result}` : (noti.action === 'USER_REPORTED' && isAdmin ? `🚨 [신고 접수] ${noti.seatLabel} - 사유: ${noti.result || '알 수 없음'}` : getNotificationText(noti.action, noti.seatLabel))}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '600' }}>{(noti.timestamp || noti.createdAt)?.toDate ? (noti.timestamp || noti.createdAt).toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금 전'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setViewMode('EVENTS')} style={{ background: viewMode === 'EVENTS' || viewMode === 'EVENT_DETAIL' ? '#2563eb' : '#f1f5f9', color: viewMode === 'EVENTS' || viewMode === 'EVENT_DETAIL' ? '#fff' : '#334155', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s' }}>이벤트</button>
          <button onClick={() => setViewMode('RANKING')} style={{ background: viewMode === 'RANKING' ? '#f59e0b' : '#f1f5f9', color: viewMode === 'RANKING' ? '#fff' : '#334155', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s', marginRight: '6px' }}>이용자 순위</button>
          <button onClick={() => setViewMode(viewMode === 'MYPAGE' ? 'MAP' : 'MYPAGE')} style={{ background: viewMode === 'MYPAGE' ? '#2563eb' : '#f1f5f9', color: viewMode === 'MYPAGE' ? '#fff' : '#334155', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s' }}>{viewMode === 'MYPAGE' ? '배치도' : '마이페이지'}</button>
          <button onClick={async () => { if (window.confirm("로그아웃 하시겠습니까?")) await signOut(auth); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s' }}>로그아웃</button>
        </div>
      </header>

      {isAdmin && viewMode === 'USERS' && <AdminDashboard />}
      {viewMode === 'MYPAGE' && <MyPage user={user} setViewMode={setViewMode} />}
      {viewMode === 'SCANNER' && isAdmin && <ScannerPage setViewMode={setViewMode} />}
      
      {/* 🚀 팀원 컴포넌트 마운트 */}
      {viewMode === 'RANKING' && <RankingPage onBack={() => setViewMode('MAP')} user={user}/>}
      {viewMode === 'EVENTS' && <EventBoard onBack={() => setViewMode('MAP')} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} />}
      {viewMode === 'EVENT_DETAIL' && <EventDetail event={selectedEvent} onBack={() => setViewMode('EVENTS')} />}
      {viewMode === 'EVENTS_ADMIN' && isAdmin && <AdminEvents />}

      {viewMode === 'MAP' && (
        <>
          {showRankingBanner && <RankingBanner onEnter={() => setViewMode('RANKING')} onClose={() => setShowRankingBanner(false)} />}
          <EventBanner onSeeAll={() => setViewMode('EVENTS')} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} />

          <div className="date-scroll-container" style={{ display: 'flex', flexWrap: 'nowrap', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '10px', width: '100%', boxSizing: 'border-box' }}>
            {weekDays.map((date, idx) => (
              <button key={idx} onClick={() => setSelectedDate(startOfDay(date))} style={{ flex: '1 0 70px', minWidth: '70px', padding: '12px 5px', borderRadius: '15px', border: 'none', background: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? '#2563eb' : '#fff', color: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? '#fff' : '#475569', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease', transform: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? 'scale(1.05)' : 'scale(1)' }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{format(date, 'E', { locale: ko })}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>{format(date, 'd')}</div>
              </button>
            ))}
            <button onClick={() => setShowFullCalendar(true)} style={{ flex: '0 0 85px', padding: '10px', borderRadius: '15px', border: '2px dashed #cbd5e1', background: 'transparent', color: '#64748b', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s ease' }}>📅 달력</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px', background: '#fff', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '800', color: '#475569' }}>시작 시간</label>
              <button onClick={() => { setIsStartOpen(!isStartOpen); setIsEndOpen(false); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{startTime} <span>▼</span></button>
              {isStartOpen && (<div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, width: '100%', maxHeight: '220px', overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', zIndex: 10 }}>{timeOptions.slice(0, -1).map(t => (<div key={t} onClick={() => { handleStartTimeChange(t); setIsStartOpen(false); }} style={{ padding: '12px 15px', cursor: 'pointer', fontWeight: '800', background: t === startTime ? '#eff6ff' : '#fff' }}>{t}</div>))}</div>)}
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '800', color: '#475569' }}>종료 시간</label>
              <button onClick={() => { setIsEndOpen(!isEndOpen); setIsStartOpen(false); }} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{endTime} <span>▼</span></button>
              {isEndOpen && (<div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, width: '100%', maxHeight: '220px', overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', zIndex: 10 }}>{timeOptions.map(t => {const isDisabled = t <= startTime; return (<div key={t} onClick={() => { if(!isDisabled) { setEndTime(t); setIsEndOpen(false); } }} style={{ padding: '12px 15px', cursor: isDisabled ? 'not-allowed' : 'pointer', fontWeight: '800', color: isDisabled ? '#cbd5e1' : '#475569', background: t === endTime ? '#eff6ff' : '#fff', opacity: isDisabled ? 0.6 : 1 }}>{t}</div>);})}</div>)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '15px', width: '100%' }}>
            {['1층', '2층', '4층'].map(floor => (<button key={floor} onClick={() => setActiveFloor(floor)} style={{ width: '100%', padding: '14px 0', borderRadius: '15px', border: 'none', background: activeFloor === floor ? '#1e293b' : '#fff', color: activeFloor === floor ? '#fff' : '#64748b', fontWeight: '900', fontSize: '1rem', cursor: 'pointer' }}>{floor}</button>))}
          </div>

          {/* 🚀 상열님 코어 기능인 FloorMap 연결 (width, height 저장 및 delete 통로 확보) */}
          <FloorMap 
            activeFloor={activeFloor} 
            title={floorTitles[activeFloor]} 
            seats={displaySeats} 
            user={user} 
            isAdmin={isAdmin} 
            currentUserData={currentUserData} 
            viewMode={viewMode} 
            setSelectedSeat={setSelectedSeat} 
            onUpdateSeats={handleUpdateSeats}
            onDeleteSeat={handleDeleteSeat} 
          />
          
          <SeatModal selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat} user={user} isAdmin={isAdmin} selectedDate={selectedDate} setSelectedDate={setSelectedDate} startTime={startTime} endTime={endTime} showFullCalendar={showFullCalendar} setShowFullCalendar={setShowFullCalendar} />

          {showFullCalendar && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
              <div style={{ background: '#fff', padding: '30px', borderRadius: '32px', width: '100%', maxWidth: '380px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} style={{ border:'none', background:'#f1f5f9', width:36, height:36, borderRadius:'50%', color: '#0f172a', fontWeight: '900' }}>◀</button>
                  <h3 style={{ margin: 0, fontWeight: '900', color: '#0f172a' }}>{format(calendarMonth, 'yyyy년 M월')}</h3>
                  <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} style={{ border:'none', background:'#f1f5f9', width:36, height:36, borderRadius:'50%', color: '#0f172a', fontWeight: '900' }}>▶</button>
                </div>
                {renderCalendar()}
                <button onClick={() => setShowFullCalendar(false)} style={{ width:'100%', marginTop:'20px', padding:'16px', border:'none', background:'#f1f5f9', borderRadius:'16px', fontWeight:'900', color: '#0f172a', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
          )}

          {myTicket && (
            <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '450px', background: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '2px solid #2563eb', zIndex: 100 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                <div><span style={{ background: myTicket.status === 'OCCUPIED' ? '#dcfce7' : '#fef08a', color: myTicket.status === 'OCCUPIED' ? '#16a34a' : '#ca8a04', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '900' }}>{myTicket.status === 'OCCUPIED' ? '✅ 입실 완료' : '🎫 오늘 예약'}</span><h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '900' }}>{myTicket.seatId} 좌석</h3></div>
                <div style={{ textAlign: 'right' }}><p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>이용 시간</p><p style={{ margin: 0, color: '#2563eb', fontSize: '1.1rem', fontWeight: '900' }}>{myTicket.startTime} ~ {myTicket.endTime}</p></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                {myTicket.status !== 'OCCUPIED' ? (<><button onClick={openQRModal} style={{ flex: 2, padding: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>QR 인증하기</button><button onClick={handleCancel} style={{ flex: 1, padding: '16px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>취소</button></>) : (<button onClick={handleCheckout} style={{ width: '100%', padding: '16px', background: '#475569', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>퇴실하기</button>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}