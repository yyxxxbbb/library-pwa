import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase'; 
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { format, addDays, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

import MyPage from './pages/MyPage';
import ScannerPage from './pages/Scanner';
import SeatModal from './components/SeatModal';
import Auth from './pages/Auth';
import FloorMap from './components/FloorMap';
import AdminDashboard from './pages/AdminDashboard';
import QRCodeGen from './components/QRCodeGen'; 

import EventBanner from './components/EventBanner';
import EventBoard from './pages/EventBoard';
import EventDetail from './pages/EventDetail';
import AdminEvents from './pages/AdminEvents';

import { useLibraryData } from './hooks/useLibraryData';
import { useUserSession } from './hooks/useUserSession';

import RankingPage from './pages/RankingPage';
import RankingBanner from './components/RankingBanner';

import FloatingChatbot from './components/FloatingChatbot';

import { handleLibraryAction } from './api/libraryService'; 

const floorTitles = { '1층': '1층 열람실', '2층': '2층 집중구역', '4층': '4층 스터디룸' };

const getNotificationText = (action, seatLabel) => {
  const label = seatLabel || '좌석';
  switch (action) {
    case 'RESERVE': return `✅ ${label} 예약이 완료되었습니다.`;
    case 'CANCEL': return `🗑️ ${label} 예약이 취소되었습니다.`;
    case 'NO_SHOW_CANCEL': return `🚨 ${label} 미입실로 예약이 취소되었습니다.`;
    case 'CHECK_IN': return `📲 ${label} 입실이 확인되었습니다.`;
    case 'RETURN': return `👋 ${label} 퇴실 처리되었습니다.`;
    case 'AUTO_CHECKOUT': return `⏳ ${label} 이용 시간이 만료되어 자동 퇴실되었습니다.`;
    case 'FORCE_EVICT': return `❌ ${label} 관리자에 의해 강제 퇴실되었습니다.`;
    default: return `🔔 ${label}에 새로운 변경사항이 있습니다.`;
  }
};

const timeOptions = [...Array(28).keys()].map(i => {
  const h = Math.floor(i / 2) + 9;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, '0')}:${m}`;
});

const getTime = (t) => {
  if (!t) return 0;
  if (t.toDate) return t.toDate().getTime();
  return new Date(t).getTime();
};

function App() {
  const { seats, user, currentUserData } = useLibraryData();
  useUserSession(user); 

  const mapRef = useRef(null);

  const [activeFloor, setActiveFloor] = useState('1층');
  const [viewMode, setViewMode] = useState('HOME'); 
  const [isBookingMode, setIsBookingMode] = useState(true);
  const [showIdQR, setShowIdQR] = useState(false);
  const [dbNotices, setDbNotices] = useState([]);
  const [boardTab, setBoardTab] = useState('NOTICE');
  
  const [systemAlert, setSystemAlert] = useState(null);

  useEffect(() => {
    if (systemAlert) {
      const timer = setTimeout(() => {
        setSystemAlert(null);
      }, 5000); 
      return () => clearTimeout(timer);
    }
  }, [systemAlert]);

  const [facilityStatus, setFacilityStatus] = useState({ '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });
  const [todayReservations, setTodayReservations] = useState([]);

  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자', '2212020']; 
  
  // 🚨 [해결] 기존 방식(이메일 쪼개기) 사용자도 무조건 관리자 권한을 유지하도록 강력한 백업 로직 추가
  const isAdmin = 
    (currentUserData && (ADMIN_IDS.includes(String(currentUserData.studentNo)) || currentUserData.role === 'MANAGER')) || 
    (user && user.email && ADMIN_IDS.includes(user.email.split('@')[0]));

  const [currentTimeString, setCurrentTimeString] = useState(new Date().toTimeString().substring(0, 5));
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeString(new Date().toTimeString().substring(0, 5)), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'facilityStatus'), (docSnap) => {
      if (docSnap.exists()) {
        setFacilityStatus(docSnap.data());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const q = query(collection(db, 'Reservations'), where('date', '==', todayStr));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => setTodayReservations(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [user]);

  const [systemSettings, setSystemSettings] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSystemSettings(data);
        if (data.isExamActive && data.examEndDate) {
          const end = new Date(data.examEndDate);
          if (new Date() > end) {
            updateDoc(doc(db, 'System', 'settings'), { isExamActive: false })
              .then(() => alert("⏰ 시험기간 통제 기간이 종료되어 자동으로 해제되었습니다."));
          }
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

  const [showRankingBanner, setShowRankingBanner] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  useEffect(() => {
    if (user && !isAdmin && (viewMode === 'USERS' || viewMode === 'SCANNER' || viewMode === 'EVENTS_ADMIN')) {
      setViewMode('HOME');
    }
  }, [user, isAdmin, viewMode]);

  useEffect(() => {
    if (!user) return;

    let eventsList = [];
    let noticesList = [];

    const mergeAndSetNotices = () => {
      const filteredEvents = eventsList.filter(item =>
        item.type?.toLowerCase().includes('notice') ||
        item.category?.includes('공지') ||
        item.title?.includes('[공지]') ||
        item.name?.includes('[공지]')
      );

      const formattedNotices = noticesList.map(n => ({ ...n, _type: 'NOTICE' }));

      const combined = [...filteredEvents, ...formattedNotices].sort((a, b) => {
        const timeA = a.createdAt?.toDate?.()?.getTime() || (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt?.toDate?.()?.getTime() || (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      setDbNotices(combined.slice(0, 5));
    };

    const unsubE = onSnapshot(collection(db, 'Events'), (snap) => {
      eventsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSetNotices();
    });

    const unsubN = onSnapshot(collection(db, 'Notices'), (snap) => {
      noticesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      mergeAndSetNotices();
    });

    return () => {
      unsubE();
      unsubN();
    };
  }, [user]);

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastReadTime, setLastReadTime] = useState(0);

  useEffect(() => {
    if (!user?.email) return;
    const stored = localStorage.getItem(`lastRead_${user.email}`);
    if (stored) {
      setLastReadTime(parseInt(stored, 10));
    } else {
      const now = Date.now();
      setLastReadTime(now);
      localStorage.setItem(`lastRead_${user.email}`, now.toString());
    }
  }, [user]);

  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  
  const [forceCleanCheck, setForceCleanCheck] = useState(false);

  useEffect(() => {
    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes() < 30 ? 30 : 0;
    if (m === 0) h += 1; 

    if (h >= 9 && h <= 21) {
      const startStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const sIdx = timeOptions.indexOf(startStr);
      if (sIdx !== -1) {
        setStartTime(startStr);
        const eIdx = Math.min(sIdx + 4, timeOptions.length - 1); 
        setEndTime(timeOptions[eIdx]);
      }
    }
  }, []);

  const [penaltyAlert, setPenaltyAlert] = useState(null);
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfDay(new Date()), i));
  const [mapReservations, setMapReservations] = useState([]);
  
  useEffect(() => {
    if (!user) return; 
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const q = query(collection(db, 'Reservations'), where('date', '==', dateStr));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => setMapReservations(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [selectedDate, user]);

  const [myActiveTickets, setMyActiveTickets] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'Reservations'), 
      where('userId', '==', user.email), 
      where('status', 'in', ['RESERVED', 'OCCUPIED'])
    );
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => setMyActiveTickets(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [user]);

  const isTodayMap = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  const displaySeats = seats.map(seat => {
    if (seat.status === 'DISABLED') return seat;

    const allReservations = [...mapReservations, ...myActiveTickets];
    
    const isOverlapped = allReservations.some(res => {
      if (res.seatId !== seat.id || res.status === 'RETURNED' || res.status === 'CANCELLED') return false;
      return startTime < res.endTime && endTime > res.startTime;
    });

    const currentActiveRes = allReservations.find(res => 
      res.seatId === seat.id && 
      res.status !== 'RETURNED' && 
      res.status !== 'CANCELLED' &&
      currentTimeString >= res.startTime && 
      currentTimeString < res.endTime
    );

    let finalStatus = seat.status;
    
    if (isTodayMap) {
      if (currentActiveRes) {
        finalStatus = currentActiveRes.status;
      } else if (seat.status === 'RESERVED' || seat.status === 'OCCUPIED') {
        finalStatus = seat.status;
      } else {
        finalStatus = isOverlapped ? 'RESERVED' : 'AVAILABLE';
      }
    } else {
      finalStatus = isOverlapped ? 'RESERVED' : 'AVAILABLE';
    }

    return { ...seat, status: finalStatus };
  });

  const myTicket = myActiveTickets.find(res => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (res.date < todayStr) return false; 
    if (res.date === todayStr) {
      return res.endTime >= currentTimeString; 
    }
    return true; 
  });

  const handleSeatSelect = (seat) => {
    if (!seat) {
      setSelectedSeat(null);
      return;
    }

    if (!isAdmin && myTicket) {
      if (seat.id !== myTicket.seatId) {
        setSystemAlert({
          title: "🚫 이용 제한",
          message: "1인 1좌석 원칙입니다.\n이미 예약하거나 이용 중인 좌석이 있습니다."
        });
        return; 
      }
    }
    setSelectedSeat(seat);
  };

  const prevStatusRef = useRef(myTicket?.status);
  const prevScannedAtRef = useRef(myTicket?.lastScannedAt);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = myTicket?.status;
    const prevScannedAt = prevScannedAtRef.current;
    const currentScannedAt = myTicket?.lastScannedAt;

    if (showIdQR && prevStatus === 'RESERVED' && currentStatus === 'OCCUPIED') {
      if (myTicket.userId === user?.email) {
        setShowIdQR(false); 
        setViewMode('MAP'); 
        
        setTimeout(() => {
          const currentSeat = seats.find(s => s.id === myTicket.seatId);
          if (currentSeat) {
            setIsBookingMode(true);
            setSelectedSeat(currentSeat);
            setForceCleanCheck(true);
          }
        }, 100);
      }
    }
    
    prevStatusRef.current = currentStatus;
    prevScannedAtRef.current = currentScannedAt;
  }, [myTicket, showIdQR, seats, user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Log'), (snap) => {
      // 🚨 알림 필터링 로직에도 구형 이메일 폴백 추가
      const myId = currentUserData?.studentNo || user?.email?.split('@')[0] || '';
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(log => {
          const logUid = log.uid ? String(log.uid).split('@')[0] : '';
          const logStuNo = log.studentNo ? String(log.studentNo) : '';
          const isMyLog = (myId && logUid === myId) || (myId && logStuNo === myId);
          return isMyLog || (isAdmin && ['USER_REPORTED', 'CHECK_IN_CLEAN_REPORT', 'REPORT_SEAT'].includes(log.action));
        })
        .sort((a, b) => getTime(b.timestamp || b.createdAt) - getTime(a.timestamp || a.createdAt));
      setNotifications(logs);
    });
  }, [user, isAdmin, currentUserData]);

  const pendingReportsCount = isAdmin ? notifications.filter(n => {
    const act = n.action || '';
    return ['USER_REPORTED', 'CHECK_IN_CLEAN_REPORT', 'REPORT_SEAT'].includes(act) || act.includes('REPORT');
  }).length : 0;

  useEffect(() => {
    if (!user || notifications.length === 0) return;
    if (isAdmin) return;

    const readPenalties = JSON.parse(localStorage.getItem(`read_penalties_${user.email}`) || '[]');
    const myId = currentUserData?.studentNo || user?.email?.split('@')[0] || '';
    
    const unreadAlert = notifications.find(n => {
      const logUid = n.uid ? String(n.uid).split('@')[0] : '';
      const logStuNo = n.studentNo ? String(n.studentNo) : '';
      const isTargetUser = (myId && logUid === myId) || (myId && logStuNo === myId);
      
      const isAlertAction = ['ADMIN_PENALTY', 'USER_REPORTED'].includes(n.action);
      
      return isAlertAction && isTargetUser && !readPenalties.includes(n.id);
    });
    
    if (unreadAlert) setPenaltyAlert(unreadAlert);
  }, [notifications, user, isAdmin, currentUserData]);

  useEffect(() => {
    const actualId = currentUserData?.studentNo || user?.email?.split('@')[0];
    if (!user || !actualId) return;
    const notifyRef = collection(db, "User", actualId, "notifications");
    const q = query(notifyRef, where("read", "==", false));
    
    const unsub = onSnapshot(q, (snap) => {
      snap.forEach((doc) => {
        const data = doc.data();
        setSystemAlert({ title: "🚨 알림", message: data.message });
        updateDoc(doc.ref, { read: true });
      });
    });
    return () => unsub();
  }, [user, currentUserData]);

  const handleDismissPenalty = () => {
    if (!penaltyAlert) return;
    const readPenalties = JSON.parse(localStorage.getItem(`read_penalties_${user.email}`) || '[]');
    readPenalties.push(penaltyAlert.id);
    localStorage.setItem(`read_penalties_${user.email}`, JSON.stringify(readPenalties));
    setPenaltyAlert(null);
  };

  const unreadCount = notifications.filter(n => getTime(n.timestamp || n.createdAt) > lastReadTime).length;
  
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      const now = Date.now();
      setLastReadTime(now);
      localStorage.setItem(`lastRead_${user?.email}`, now.toString());
    }
  };

  const getRealSeat = () => seats.find(s => s.id === myTicket?.seatId) || { id: myTicket?.seatId };

  const handleCloseIdQR = async () => {
    setShowIdQR(false);
    if (myTicket && myTicket.status === 'RESERVED' && myTicket.isImmediate) {
      await handleLibraryAction({ actionType: 'CANCEL_IMMEDIATE', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
    }
  };

  const handleCheckout = async () => {
    await handleLibraryAction({ actionType: 'RETURN', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
  };

  const handleCancel = async () => {
    if (myTicket?.isImmediate && myTicket.status === 'RESERVED') {
      await handleLibraryAction({ actionType: 'CANCEL_IMMEDIATE', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
    } else {
      await handleLibraryAction({ actionType: 'CANCEL', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
    }
  };

  const handleStartTimeChange = (e) => {
    const newStart = e.target.value;
    setStartTime(newStart);
    if (newStart >= endTime) {
      const startIdx = timeOptions.indexOf(newStart);
      if (startIdx < timeOptions.length - 1) setEndTime(timeOptions[startIdx + 1]);
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
            <button key={i} disabled={isDisabled} onClick={() => { setSelectedDate(startOfDay(day)); setShowFullCalendar(false); }} style={{ aspectRatio: '1', border: 'none', borderRadius: '12px', cursor: isDisabled ? 'default' : 'pointer', background: isSelected ? '#2563eb' : 'transparent', color: isSelected ? '#fff' : isDisabled ? '#cbd5e1' : !isCurrentMonth ? '#94a3b8' : '#000000', fontWeight: isSelected ? '900' : '700', fontSize: '1rem', position: 'relative' }}>
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    );
  };

  const getFinalStatus = (floor) => {
    const dbStat = facilityStatus[floor] || 'AUTO';
    if (dbStat !== 'AUTO') return dbStat;

    const floorSeats = seats.filter(s => s.floor === floor || String(s.id).startsWith(floor.charAt(0)) || String(s.id).includes(floor));
    if (floorSeats.length === 0) return 'AVAILABLE'; 

    let occupied = 0;
    floorSeats.forEach(seat => {
      const isOccupied = todayReservations.some(res =>
        res.seatId === seat.id &&
        res.status !== 'RETURNED' &&
        res.status !== 'CANCELLED' &&
        currentTimeString >= res.startTime &&
        currentTimeString < res.endTime
      );
      if (isOccupied) occupied++;
    });

    const ratio = occupied / floorSeats.length;
    if (ratio >= 0.9) return 'UNAVAILABLE'; 
    if (ratio >= 0.7) return 'CROWDED';     
    return 'AVAILABLE';                     
  };

  const renderFacilityBadge = (floor) => {
    const status = getFinalStatus(floor);
    let text = '이용 가능';
    let bg = '#3b82f6';
    
    if (floor === '4층' && status === 'AVAILABLE') bg = '#3b82f6'; 
    if (status === 'CROWDED') { text = '혼잡'; bg = '#f59e0b'; } 
    if (status === 'UNAVAILABLE') { text = '이용 불가'; bg = '#dc2626'; } 

    return (
      <span style={{ background: bg, color: '#fff', fontSize: '0.75rem', fontWeight: '800', padding: '4px 10px', borderRadius: '20px', transition: '0.3s' }}>
        {text}
      </span>
    );
  };

  const isIncompleteUser = user && user.email && !user.email.includes('@test.com') && (!user.emailVerified || !user.displayName);

  if (!user || isIncompleteUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
        {systemSettings?.isExamActive && (
          <div style={{ background: '#ef4444', color: '#fff', padding: '15px 20px', textAlign: 'center', fontWeight: '900', fontSize: '1rem', zIndex: 9999 }}>
            🚨 [시험기간 특별 통제] 현재 예약 및 출입이 엄격히 제한됩니다.<br/>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>적용 기간: {systemSettings.examStartDate?.replace('T', ' ')} ~ {systemSettings.examEndDate?.replace('T', ' ')}</span>
          </div>
        )}
        {/* Auth 컴포넌트에 props 전달도 추가하여 통제 기능 완벽 호환 */}
        <Auth isExamPeriod={systemSettings?.isExamActive} />
      </div>
    );
  }

  return (
    <div style={{ padding: isSmallMobile ? '10px' : '20px', width: '100%', maxWidth: '1300px', margin: '0 auto', boxSizing: 'border-box', fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100vh', position: 'relative', paddingBottom: myTicket && (viewMode === 'HOME' || viewMode === 'MAP') ? '140px' : '30px' }}>
      
      {systemAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 9999999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '3px solid #2563eb', maxWidth: '350px', width: '90%' }}>
            <div style={{ fontSize: '3rem', marginBottom: '15px' }}>✅</div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{systemAlert.title}</h2>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', whiteSpace: 'pre-wrap', color: '#475569' }}>{systemAlert.message}</p>
          </div>
        </div>
      )}

      {penaltyAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.85)', zIndex: 999999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '40px 30px', borderRadius: '24px', width: '100%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🚨</div>
            <h2 style={{ margin: '0 0 15px 0', color: '#dc2626', fontWeight: '900', fontSize: '1.6rem' }}>{penaltyAlert.action === 'ADMIN_PENALTY' ? '도서관 이용 제한 안내' : '도서관 이용 경고 안내'}</h2>
            <button onClick={handleDismissPenalty} style={{ width: '100%', padding: '18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 8px 20px rgba(220, 38, 38, 0.3)' }}>내용을 확인했습니다</button>
          </div>
        </div>
      )}

      {showIdQR && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.85)', zIndex: 999999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '340px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', position: 'relative' }}>
            <button onClick={handleCloseIdQR} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            <h3 style={{ margin: '10px 0 5px 0', fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>게이트 스캔 (입실)</h3>
            <p style={{ margin: '0 0 25px 0', fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>입구 키오스크에 QR을 인식해 주세요.</p>
            
            <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <QRCodeGen studentId={currentUserData?.studentNo || user?.email?.split('@')[0] || 'student_id'} size={180} />
            </div>
            
            <p style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: '900', color: '#2563eb' }}>{isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0])} 님</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600' }}>울산과학대학교 스마트 도서관</p>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', marginBottom: '20px', background: '#fff', padding: '15px 25px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          <h2 onClick={() => setViewMode('HOME')} style={{ margin: 0, color: '#0f172a', fontWeight: '900', fontSize: '1.5rem', whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="#2563eb" style={{ width: '28px', height: '28px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
            스마트 도서관
          </h2>

          {isAdmin && !isMobile && (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '2px' }}>
              <button onClick={() => setViewMode('HOME')} style={{ padding: '8px 16px', background: viewMode === 'HOME' || viewMode === 'MAP' ? '#2563eb' : 'transparent', color: viewMode === 'HOME' || viewMode === 'MAP' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' }}>홈</button>
              <button onClick={() => setViewMode('USERS')} style={{ position: 'relative', padding: '8px 16px', background: viewMode === 'USERS' ? '#2563eb' : 'transparent', color: viewMode === 'USERS' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' }}>회원관리 {pendingReportsCount > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '10px', height: '10px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>}</button>
              <button onClick={() => setViewMode('SCANNER')} style={{ padding: '8px 16px', background: viewMode === 'SCANNER' ? '#2563eb' : 'transparent', color: viewMode === 'SCANNER' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' }}>입구 스캐너</button>
              <button onClick={() => setViewMode('EVENTS_ADMIN')} style={{ padding: '8px 16px', background: viewMode === 'EVENTS_ADMIN' ? '#2563eb' : 'transparent', color: viewMode === 'EVENTS_ADMIN' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem', transition: '0.2s' }}>관리</button>
            </div>
          )}
        </div>
        
        {isAdmin && isMobile && (
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '4px', width: '100%', flexWrap: 'wrap' }}>
            <button onClick={() => setViewMode('HOME')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'HOME' || viewMode === 'MAP' ? '#2563eb' : 'transparent', color: viewMode === 'HOME' || viewMode === 'MAP' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>홈</button>
            <button onClick={() => setViewMode('USERS')} style={{ position: 'relative', flex: 1, padding: '10px 0', background: viewMode === 'USERS' ? '#2563eb' : 'transparent', color: viewMode === 'USERS' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>
              회원관리
              {pendingReportsCount > 0 && <span style={{ position: 'absolute', top: '4px', right: '8px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>}
            </button>
            <button onClick={() => setViewMode('SCANNER')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'SCANNER' ? '#2563eb' : 'transparent', color: viewMode === 'SCANNER' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>스캐너</button>
            <button onClick={() => setViewMode('EVENTS_ADMIN')} style={{ flex: 1, padding: '10px 0', background: viewMode === 'EVENTS_ADMIN' ? '#16a34a' : 'transparent', color: viewMode === 'EVENTS_ADMIN' ? '#fff' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>공지/이벤트</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: isMobile ? 'center' : 'flex-end', width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
          {/* 🚨 [해결] 기존 이메일 쪼개기 방식도 정상 출력되도록 강력한 백업 로직 추가 */}
          <p style={{ margin: 0, fontWeight: '900', color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            👤 {isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0])}님
          </p>
          <div style={{ position: 'relative' }}>
            <button onClick={toggleNotifications} style={{ background: '#f1f5f9', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: '0.2s' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#475569" style={{ width: '18px', height: '18px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: '900', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #fff' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {showNotifications && (
              <div style={{ position: 'absolute', top: '45px', right: isMobile ? '-50px' : '0', width: '300px', background: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', zIndex: 1000 }}>
                <div style={{ padding: '15px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h4 style={{ margin: '0', fontSize: '0.95rem', fontWeight: '900' }}>새로운 알림</h4><span style={{ fontSize: '0.8rem', cursor: 'pointer', fontWeight: '700' }} onClick={() => setShowNotifications(false)}>닫기 ✕</span></div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '10px' }}>
                  {notifications.length === 0 ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '20px 0', margin: 0, fontWeight: '700' }}>새로운 알림이 없습니다.</p> : notifications.map(noti => (
                    <div key={noti.id} style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', background: ((noti.timestamp || noti.createdAt)?.toDate?.().getTime() || 0) > lastReadTime ? '#eff6ff' : 'transparent', borderRadius: '8px' }}>
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
          
          <button onClick={() => setViewMode(viewMode === 'MYPAGE' ? 'HOME' : 'MYPAGE')} style={{ background: viewMode === 'MYPAGE' ? '#2563eb' : '#f1f5f9', color: viewMode === 'MYPAGE' ? '#fff' : '#334155', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', transition: '0.2s' }}>{viewMode === 'MYPAGE' ? '홈으로' : '마이페이지'}</button>
          <button onClick={async () => { if (window.confirm("로그아웃 하시겠습니까?")) await signOut(auth); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', padding: '8px 14px', cursor: 'pointer', transition: '0.2s' }}>로그아웃</button>
        </div>
      </header>

      {isAdmin && viewMode === 'USERS' && <AdminDashboard />}
      {viewMode === 'MYPAGE' && <MyPage user={user} setViewMode={setViewMode} />}
      {viewMode === 'SCANNER' && isAdmin && <ScannerPage setViewMode={setViewMode} setSystemAlert={setSystemAlert} />}
      {viewMode === 'RANKING' && <RankingPage onBack={() => setViewMode('HOME')} user={user}/>}
      
      {viewMode === 'EVENTS' && <EventBoard initialTab={boardTab} onBack={() => setViewMode('HOME')} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} onSelectNotice={(notice) => { setSelectedEvent({ ...notice, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); }} />}
      {viewMode === 'EVENT_DETAIL' && <EventDetail event={selectedEvent} onBack={() => setViewMode('EVENTS')} />}
      {viewMode === 'EVENTS_ADMIN' && isAdmin && <AdminEvents />}

      {(viewMode === 'HOME' || viewMode === 'MAP') && (
        <>
          {viewMode === 'HOME' && (
            <>
              {showRankingBanner && <RankingBanner onEnter={() => setViewMode('RANKING')} onClose={() => setShowRankingBanner(false)} />}
              
              <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                <div style={{ flex: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  {[
                    { mode: 'MAP', label: '배치도 보기', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px', color: '#2563eb' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg> },
                    { mode: 'SCANNER', label: '입구 스캐너', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8 4H5a2 2 0 00-2 2v3M16 4h3a2 2 0 012 2v3M8 20H5a2 2 0 01-2-2v-3M16 20h3a2 2 0 002-2v-3" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" stroke="#2563eb" strokeWidth="2.5" /><rect x="7" y="7" width="3" height="3" rx="0.5" strokeWidth="1.5" /><rect x="14" y="7" width="3" height="3" rx="0.5" strokeWidth="1.5" /><rect x="7" y="14" width="3" height="3" rx="0.5" strokeWidth="1.5" /></svg> },
                    { mode: 'EVENTS', tab: 'NOTICE', label: '공지사항', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px', color: '#2563eb' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg> },
                    { mode: 'EVENTS', tab: 'EVENT', label: '이벤트', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px', color: '#2563eb' }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg> },
                    { mode: 'MYPAGE', label: '마이페이지', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px', color: '#2563eb' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                    { mode: 'RANKING', label: '이용자 순위', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '32px', height: '32px', color: '#2563eb' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> }
                  ].map((item, idx) => {
                    if (item.mode === 'SCANNER' && !isAdmin) return null;
                    return (
                      <div key={idx} onClick={() => {
                        if(item.mode === 'MAP') { setIsBookingMode(false); setSelectedSeat(null); }
                        if(item.tab) setBoardTab(item.tab);
                        setViewMode(item.mode);
                      }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '8px', padding: '15px 5px', borderRadius: '16px', background: '#f8fafc', transition: '0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                      >
                        <div style={{ color: '#2563eb' }}>{item.svg}</div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e293b', marginTop: '8px' }}>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <button onClick={() => { setIsBookingMode(true); setSelectedSeat(null); setViewMode('MAP'); }} style={{ flex: 1, padding: '20px', background: '#2563eb', color: '#fff', borderRadius: '20px', fontSize: '1.1rem', fontWeight: '900', border: 'none', cursor: 'pointer' }}>좌석 예약하러 가기</button>
                  <button onClick={() => setShowIdQR(true)} style={{ flex: 1, padding: '20px', background: '#0f172a', color: '#fff', borderRadius: '20px', fontSize: '1.1rem', fontWeight: '900', border: 'none', cursor: 'pointer' }}>내 모바일 출입증</button>
                </div>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', paddingLeft: '5px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>시설 안내</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                  <div style={{ background: '#fff', borderRadius: '24px', padding: '25px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>1층 <span style={{ color: '#2563eb' }}>도서관</span></h4>
                      {renderFacilityBadge('1층')}
                    </div>
                    <p style={{ margin: '0 0 18px 0', fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>수용 인원: 72명 | 테이블 5개 | 좌석 68석</p>
                    <button onClick={() => { setActiveFloor('1층'); setIsBookingMode(false); setSelectedSeat(null); setViewMode('MAP'); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ marginTop: 'auto', width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#2563eb', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', transition: '0.2s' }}>배치도 보기 →</button>
                  </div>

                  <div style={{ background: '#fff', borderRadius: '24px', padding: '25px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>2층 <span style={{ color: '#2563eb' }}>도서관</span></h4>
                      {renderFacilityBadge('2층')}
                    </div>
                    <p style={{ margin: '0 0 18px 0', fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>수용 인원: 40명 | 테이블 6개 | 좌석 42석</p>
                    <button onClick={() => { setActiveFloor('2층'); setIsBookingMode(false); setSelectedSeat(null); setViewMode('MAP'); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ marginTop: 'auto', width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#2563eb', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', transition: '0.2s' }}>배치도 보기 →</button>
                  </div>

                  <div style={{ background: '#fff', borderRadius: '24px', padding: '25px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>4층 <span style={{ color: '#2563eb' }}>열람실</span></h4>
                      {renderFacilityBadge('4층')}
                    </div>
                    <p style={{ margin: '0 0 18px 0', fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>수용 인원: 54명 | 테이블 15개 | 좌석 54석</p>
                    <button onClick={() => { setActiveFloor('4층'); setIsBookingMode(false); setSelectedSeat(null); setViewMode('MAP'); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ marginTop: 'auto', width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#3b82f6', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', transition: '0.2s' }}>배치도 보기 →</button>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '20px 25px', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '40px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>공지사항</h3>
                  </div>
                  <button onClick={() => { setBoardTab('NOTICE'); setViewMode('EVENTS'); }} style={{ background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '12px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer', transition: '0.2s' }}>더 보기 →</button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {dbNotices.length === 0 ? (
                    <div style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.95rem', fontWeight: '700' }}>
                      등록된 공지사항이 없습니다.
                    </div>
                  ) : (
                    dbNotices.map((notice, idx) => (
                      <div 
                        key={notice.id || idx} 
                        onClick={() => { setSelectedEvent({ ...notice, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); }} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: idx === dbNotices.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', transition: '0.2s' }}
                      >
                        <span style={{ fontSize: '0.95rem', color: '#334155', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '15px' }}>
                          {notice.title || notice.name || '제목 없음'}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {notice.createdAt?.toDate ? format(notice.createdAt.toDate(), 'yyyy-MM-dd') : (notice.date || '')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <EventBanner onSeeAll={() => { setBoardTab('EVENT'); setViewMode('EVENTS'); }} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} />
            </>
          )}

          {viewMode === 'MAP' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => setViewMode('HOME')} style={{ padding: '12px 20px', background: '#fff', color: '#0f172a', borderRadius: '12px', border: '1px solid #cbd5e1', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)', transition: '0.2s' }}>
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                  메인 홈으로
                </button>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: isBookingMode ? '#2563eb' : '#0f172a' }}>
                  {isBookingMode ? '📅 좌석 예약하기' : '🗺️ 도서관 배치도 안내'}
                </h2>
              </div>

              {isBookingMode && (
                <div className="date-scroll-container" style={{ display: 'flex', flexWrap: 'nowrap', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '10px', width: '100%', boxSizing: 'border-box' }}>
                  {weekDays.map((date, idx) => (
                    <button key={idx} onClick={() => setSelectedDate(startOfDay(date))} style={{ flex: '1 0 70px', minWidth: '70px', padding: '12px 5px', borderRadius: '15px', border: 'none', background: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? '#2563eb' : '#fff', color: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? '#fff' : '#475569', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease', transform: format(selectedDate, 'yyMMdd') === format(date, 'yyMMdd') ? 'scale(1.05)' : 'scale(1)' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{format(date, 'E', { locale: ko })}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>{format(date, 'd')}</div>
                    </button>
                  ))}
                  <button onClick={() => setShowFullCalendar(true)} style={{ flex: '0 0 85px', padding: '10px', borderRadius: '15px', border: '2px dashed #cbd5e1', background: 'transparent', color: '#64748b', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s ease' }}>📅 달력</button>
                </div>
              )}

              <div ref={mapRef} style={{ scrollMarginTop: '20px', display: 'grid', gridTemplateColumns: (isMobile || !isBookingMode) ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '25px', alignItems: 'end', background: '#fff', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
                
                {isBookingMode && (
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '800', color: '#475569' }}>시작 시간</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem' }}>🕒</span>
                        <select value={startTime} onChange={handleStartTimeChange} style={{ width: '100%', padding: '14px 14px 14px 35px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: '800', cursor: 'pointer', outline: 'none', appearance: 'none' }}>
                          {timeOptions.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '800', color: '#475569' }}>종료 시간</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem' }}>🕒</span>
                        <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: '100%', padding: '14px 14px 14px 35px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: '800', cursor: 'pointer', outline: 'none', appearance: 'none' }}>
                          {timeOptions.map(t => <option key={t} value={t} disabled={t <= startTime}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', gridColumn: isBookingMode ? 'auto' : '1 / -1' }}>
                  {[{ id: '1층', label: '도서관(1층)' }, { id: '2층', label: '도서관(2층)' }, { id: '4층', label: '열람실(4층)' }].map(floor => (
                    <button key={floor.id} onClick={() => setActiveFloor(floor.id)} 
                      style={{ flex: 1, padding: '14px 0', borderRadius: '12px', border: activeFloor === floor.id ? 'none' : '1px solid #e2e8f0', background: activeFloor === floor.id ? '#2563eb' : '#f8fafc', color: activeFloor === floor.id ? '#fff' : '#64748b', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer', transition: '0.2s', boxShadow: activeFloor === floor.id ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none' }}>
                      {floor.label}
                    </button>
                  ))}
                </div>
              </div>

              <FloorMap activeFloor={activeFloor} title={floorTitles[activeFloor]} seats={displaySeats} user={user} isAdmin={isAdmin} currentUserData={currentUserData} viewMode={viewMode} setSelectedSeat={handleSeatSelect} />
              
              {isBookingMode && (
                <SeatModal 
                  selectedSeat={selectedSeat} 
                  setSelectedSeat={setSelectedSeat} 
                  user={user} 
                  isAdmin={isAdmin} 
                  currentUserData={currentUserData} 
                  selectedDate={selectedDate} 
                  setSelectedDate={setSelectedDate} 
                  startTime={startTime} 
                  endTime={endTime} 
                  showFullCalendar={showFullCalendar} 
                  setShowFullCalendar={setShowFullCalendar} 
                  setSystemAlert={setSystemAlert} 
                  setShowIdQR={setShowIdQR} 
                  forceCleanCheck={forceCleanCheck} 
                  setForceCleanCheck={setForceCleanCheck} 
                />
              )}

              {isBookingMode && showFullCalendar && (
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
            </>
          )}

          {myTicket && (
            <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', background: '#fff', borderRadius: '20px', padding: '16px 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', border: '2px solid #2563eb', zIndex: 100 }}>
              
              {myTicket.status !== 'OCCUPIED' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <span style={{ background: '#fef08a', color: '#ca8a04', padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '900' }}>
                        {myTicket.isImmediate ? "⚡ 현장 예약 대기" : (myTicket.date === format(new Date(), 'yyyy-MM-dd') ? "🎫 오늘 예약" : "🎫 사전 예약")}
                      </span>
                      <h3 style={{ margin: '6px 0 0 0', fontSize: '1.4rem', fontWeight: '900' }}>
                        {myTicket.seatId}
                        {myTicket.date !== format(new Date(), 'yyyy-MM-dd') && (
                          <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px' }}>({myTicket.date.substring(5)})</span>
                        )}
                      </h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>이용 시간</p>
                      <p style={{ margin: 0, color: '#2563eb', fontSize: '1.05rem', fontWeight: '900' }}>{myTicket.startTime} ~ {myTicket.endTime}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowIdQR(true)} style={{ flex: 2, padding: '14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem' }}>QR 인증하기</button>
                    <button onClick={handleCancel} style={{ flex: 1, padding: '14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem' }}>취소</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    {/* 🚨 [해결] 기존 방식 이용자도 이름이 올바르게 렌더링되도록 백업 로직 추가 */}
                    <p style={{ margin: '0 0 4px 0', color: '#2563eb', fontSize: '0.85rem', fontWeight: '900' }}>👤 {isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0])}님이 사용중인 좌석</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#0f172a' }}>{myTicket.seatId}</h3>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontWeight: '700' }}>~ {myTicket.endTime} 까지</p>
                    </div>
                  </div>
                  <button onClick={handleCheckout} style={{ padding: '14px 20px', background: '#475569', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>퇴실하기</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <FloatingChatbot />
    </div>
  );
}

export default App;