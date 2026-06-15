import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, increment, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const timeOptions = [...Array(48).keys()].map(i => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, '0')}:${m}`;
});

// 조치 방법 옵션 목록
const actionOptions = [
  { value: 'WARNING', label: '단순 경고 (이용 정지 없음)' },
  { value: 'SUSPEND_1', label: '1일 이용 정지' },
  { value: 'SUSPEND_3', label: '3일 이용 정지' },
  { value: 'SUSPEND_7', label: '7일 이용 정지' },
  { value: 'SUSPEND_30', label: '30일 이용 정지' }
];

// 🚨 [핵심] 챗봇의 문자열 시간을 안전하게 변환
const getTime = (t) => {
  if (!t) return 0;
  if (t.toDate) return t.toDate().getTime();
  return new Date(t).getTime();
};

export default function AdminDashboard() {
  const [usersList, setUsersList] = useState([]); 
  const [tempSearch, setTempSearch] = useState(''); 
  const [debouncedSearch, setDebouncedSearch] = useState(''); 
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });

  const [isExamActive, setIsExamActive] = useState(false);
  const [examStartDate, setExamStartDate] = useState('');
  const [examEndDate, setExamEndDate] = useState('');

  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerTime, setPickerTime] = useState("09:00");

  const [actionReport, setActionReport] = useState(null); 
  const [actionType, setActionType] = useState('WARNING'); 

  const [activeTab, setActiveTab] = useState('REPORTS'); 
  const [reportsList, setReportsList] = useState([]); 
  const [aiAppealsList, setAiAppealsList] = useState([]);

  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const now = new Date();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'System', 'settings'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsExamActive(data.isExamActive || false);
          setExamStartDate(data.examStartDate || '');
          setExamEndDate(data.examEndDate || '');
        }
      } catch (error) { console.error("설정 로드 실패:", error); }
    };
    fetchSettings();
  }, []);

  const saveExamPeriod = async () => {
    if (!examStartDate || !examEndDate) return alert("🚨 시작 일시와 종료 일시를 모두 설정해주세요.");
    if (examStartDate >= examEndDate) return alert("🚨 종료 일시가 시작 일시보다 빠를 수 없습니다.");
    
    try {
      await setDoc(doc(db, 'System', 'settings'), {
        isExamActive: true, examStartDate, examEndDate, updatedAt: new Date()
      }, { merge: true });
      setIsExamActive(true);
      alert("✅ 시험기간 통제가 시작되었습니다.");
    } catch (e) { alert("저장 중 오류가 발생했습니다."); }
  };

  const clearExamPeriod = async () => {
    try {
      await setDoc(doc(db, 'System', 'settings'), {
        isExamActive: false, examStartDate: '', examEndDate: '', updatedAt: new Date()
      }, { merge: true });
      setIsExamActive(false); setExamStartDate(''); setExamEndDate('');
      alert("❌ 시험기간 통제가 해제되었습니다.");
    } catch (e) { alert("해제 중 오류가 발생했습니다."); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(tempSearch); }, 300);
    return () => clearTimeout(timer);
  }, [tempSearch]);

  const loadUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "User"));
      const usersMap = {}; 
      querySnapshot.docs.forEach(d => { usersMap[d.id] = d.data(); });
      setUsersList(Object.values(usersMap));

      const logsSnap = await getDocs(collection(db, 'Log'));
      const logs = await Promise.all(logsSnap.docs.map(async (d) => {
        const data = d.data();
        
        let realName = '추적 불가';
        let studentNo = data.uid?.split('@')[0] || '';
        
        if (studentNo && usersMap[studentNo]) {
          realName = usersMap[studentNo].name || '이름 없음';
        }

        let reporterName = '이름 없음';
        let reporterNo = data.reporter?.split('@')[0] || '';
        if (reporterNo && usersMap[reporterNo]) {
          reporterName = usersMap[reporterNo].name || '이름 없음';
        }

        return { id: d.id, ...data, realName, studentNo, reporterName, reporterNo };
      }));

      // 🚨 [수정] 챗봇의 리포트 데이터를 포함하도록 포괄적 필터링
      setReportsList(logs.filter(l => {
        const act = l.action || '';
        return ['USER_REPORTED', 'CHECK_IN_CLEAN_REPORT', 'REPORT_SEAT'].includes(act) || act.includes('REPORT');
      }).sort((a, b) => getTime(b.createdAt || b.timestamp) - getTime(a.createdAt || a.timestamp)));
        
      const appealsRef = collection(db, 'Appeals');
      const appealsSnap = await getDocs(appealsRef);
      const appealsData = appealsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAiAppealsList(appealsData.sort((a, b) => getTime(b.createdAt || b.timestamp) - getTime(a.createdAt || a.timestamp)));

      const labels = [];
      const dataMap = {}; 
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`; 
        labels.push(dateStr);
        dataMap[dateStr] = 0; 
      }

      logs.forEach(data => {
        if (data.action === 'COMPLETED' || data.action === 'RETURN') { 
          const timeObj = data.createdAt || data.timestamp;
          if (timeObj) {
            const date = timeObj.toDate ? timeObj.toDate() : new Date(timeObj);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            if (dataMap[dateStr] !== undefined) dataMap[dateStr] += 1;
          }
        }
      });

      setChartData({
        labels: labels,
        datasets: [{ label: '도서관 이용 완료 횟수', data: labels.map(label => dataMap[label]), backgroundColor: 'rgba(59, 130, 246, 0.8)', borderColor: '#2563eb', borderWidth: 1, borderRadius: 6 }]
      });

    } catch (error) { console.error(error); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleResetPenaltyOnly = async (studentNo, studentName) => {
    if (window.confirm(`${studentName}(${studentNo}) 학생의 이용정지를 해제하시겠습니까?`)) {
      try {
        const userRef = doc(db, "User", studentNo);
        await updateDoc(userRef, { penaltyUntil: null, resetCount: increment(1) });
        alert(`✅ 해제되었습니다.`);
        loadUsers(); 
      } catch (error) { alert("오류가 발생했습니다."); }
    }
  };

  const submitAction = async () => {
    if (!actionReport) return;
    
    const targetId = actionReport.studentNo;
    if (!targetId || targetId === '정보 없음' || targetId === '추적 불가') {
      return alert("🚨 대상(피신고자)이 특정되지 않아 직접 제재를 가할 수 없습니다.");
    }

    const selectedOption = actionOptions.find(opt => opt.value === actionType);
    if (!window.confirm(`${actionReport.realName}(${targetId}) 사용자에게 [${selectedOption.label}] 처리를 진행하시겠습니까?`)) return;

    try {
      const userRef = doc(db, "User", targetId);
      let days = 0;
      if (actionType === 'SUSPEND_1') days = 1;
      else if (actionType === 'SUSPEND_3') days = 3;
      else if (actionType === 'SUSPEND_7') days = 7;
      else if (actionType === 'SUSPEND_30') days = 30;

      if (days > 0) {
        const penaltyUntil = new Date();
        penaltyUntil.setDate(penaltyUntil.getDate() + days);
        await updateDoc(userRef, { penaltyCount: increment(1), penaltyUntil: penaltyUntil });
      } else {
        await updateDoc(userRef, { penaltyCount: increment(1) });
      }

      await addDoc(collection(db, "Log"), {
        action: 'ADMIN_PENALTY',
        uid: targetId,
        seatLabel: actionReport.seatLabel || '알 수 없음',
        result: `관리자 직권 조치: ${selectedOption.label}`,
        createdAt: serverTimestamp()
      });

      await deleteDoc(doc(db, "Log", actionReport.id));
      alert(`✅ 조치가 완료되었습니다.`);
      setActionReport(null); 
      loadUsers();
    } catch (e) { alert("처리 중 오류가 발생했습니다."); }
  };

  const handleDismissReport = async (reportId) => {
    if (!window.confirm("신고 내용을 반려(삭제)하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "Log", reportId));
      loadUsers();
    } catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleResolveAppeal = async (appealId) => {
    if (!window.confirm("이 접수 건을 '확인 완료' 처리하시겠습니까?")) return;
    try {
      await updateDoc(doc(db, "Appeals", appealId), { status: 'RESOLVED' });
      alert("✅ 확인 완료 처리되었습니다.");
      loadUsers();
    } catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleDeleteAppeal = async (appealId) => {
    if (!window.confirm("이 접수 내역을 완전히 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "Appeals", appealId));
      loadUsers();
    } catch (e) { alert("오류가 발생했습니다."); }
  };

  const openViewer = (photos, index) => {
    setViewerPhotos(photos);
    setCurrentPhotoIndex(index);
  };
  const closeViewer = () => {
    setViewerPhotos([]);
    setCurrentPhotoIndex(0);
  };

  const openPicker = (target) => {
    if (isExamActive) return;
    setPickerTarget(target);
    const existingVal = target === 'start' ? examStartDate : examEndDate;
    if (existingVal) {
      try {
        const [dStr, tStr] = existingVal.split('T');
        const parsedDate = new Date(dStr);
        setPickerDate(parsedDate); setPickerMonth(parsedDate); setPickerTime(tStr || "09:00");
      } catch (e) {
        setPickerDate(new Date()); setPickerMonth(new Date()); setPickerTime("09:00");
      }
    } else {
      setPickerDate(new Date()); setPickerMonth(new Date()); setPickerTime("09:00");
    }
  };

  const applyPicker = () => {
    const val = `${format(pickerDate, 'yyyy-MM-dd')}T${pickerTime}`;
    if (pickerTarget === 'start') {
      setExamStartDate(val);
      if (examEndDate && val >= examEndDate) setExamEndDate(''); 
    } else {
      setExamEndDate(val);
    }
    setPickerTarget(null);
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(pickerMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '10px' }}>
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <div key={d} style={{ textAlign:'center', fontWeight:'900', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8', fontSize:'0.8rem' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
          {calendarDays.map((day, i) => {
            const isSelected = isSameDay(day, pickerDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            return (
              <button 
                key={i} 
                onClick={() => {
                  setPickerDate(day);
                  if (pickerTarget === 'end' && examStartDate) {
                    const [sDate, sTime] = examStartDate.split('T');
                    if (format(day, 'yyyy-MM-dd') === sDate && pickerTime <= sTime) {
                      const sIdx = timeOptions.indexOf(sTime);
                      if (sIdx < timeOptions.length - 1) setPickerTime(timeOptions[sIdx + 1]);
                    }
                  }
                }} 
                style={{ padding: '10px 0', border: 'none', borderRadius: '8px', cursor: 'pointer', background: isSelected ? '#2563eb' : 'transparent', color: isSelected ? '#fff' : !isCurrentMonth ? '#cbd5e1' : '#1e293b', fontWeight: isSelected ? '900' : '700', fontSize: '0.95rem', transition: '0.2s' }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: window.innerWidth < 600 ? '15px' : '30px', width: '100%', boxSizing: 'border-box' }}>
      
      {pickerTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>
              {pickerTarget === 'start' ? '🟢 시작 일시 설정' : '🔴 종료 일시 설정'}
            </h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '12px' }}>
              <button onClick={() => setPickerMonth(subMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#0f172a' }}>◀</button>               
              <h4 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem', color: '#0f172a' }}>{format(pickerMonth, 'yyyy년 M월')}</h4>
              <button onClick={() => setPickerMonth(addMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#0f172a' }}>▶</button>
            </div>

            {renderCalendar()}

            <div style={{ background: '#ffffff', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '900', color: '#475569' }}>시간 선택</label>
              <select 
                value={pickerTime} 
                onChange={(e) => setPickerTime(e.target.value)} 
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e2e8f0', fontWeight: '900', fontSize: '1rem', color: '#2563eb', outline: 'none', background: '#ffffff', cursor: 'pointer' }}
              >
                {timeOptions.map(t => {
                  let isDisabled = false;
                  if (pickerTarget === 'end' && examStartDate) {
                    const [startDatePart, startTimePart] = examStartDate.split('T');
                    const currentPickerDatePart = format(pickerDate, 'yyyy-MM-dd');
                    if (currentPickerDatePart === startDatePart && t <= startTimePart) {
                      isDisabled = true;
                    }
                  }
                  return (
                    <option key={t} value={t} disabled={isDisabled}>
                      {t} {isDisabled ? '' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPickerTarget(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#e2e8f0', color: '#475569', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>취소</button>
              <button onClick={applyPicker} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>✅ 적용하기</button>
            </div>
          </div>
        </div>
      )}

      {actionReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.4rem', fontWeight: '900', color: '#dc2626', textAlign: 'center' }}>🚨 신고 조치하기</h3>
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#475569', fontWeight: '700' }}>
                대상: <span style={{color: '#0f172a', fontWeight: '900', fontSize: '1.05rem'}}>{actionReport.realName} ({actionReport.studentNo})</span>
              </p>
              <p style={{ margin: '0', fontSize: '0.9rem', color: '#475569', fontWeight: '700' }}>
                신고 사유: <span style={{color: '#dc2626', fontWeight: '900'}}>{actionReport.result || actionReport.issues?.join(', ')}</span>
              </p>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.95rem', fontWeight: '900', color: '#0f172a' }}>조치 방법 선택</label>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', fontWeight: '900', fontSize: '1rem', color: '#2563eb', outline: 'none', background: '#ffffff', cursor: 'pointer' }}>
                {actionOptions.map(opt => ( <option key={opt.value} value={opt.value}>{opt.label}</option> ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setActionReport(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#e2e8f0', color: '#475569', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>취소</button>
              <button onClick={submitAction} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)' }}>✅ 조치 완료</button>
            </div>
          </div>
        </div>
      )}

      {viewerPhotos.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', zIndex: 9999999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <button onClick={closeViewer} style={{ position: 'absolute', top: '30px', right: '30px', background: 'rgba(255,255,255,0.2)', border: 'none', width: '50px', height: '50px', borderRadius: '50%', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: '0.2s' }}>✕</button>
          
          <img src={viewerPhotos[currentPhotoIndex]} alt="증거 사진 확대" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
          
          {viewerPhotos.length > 1 && (
            <div style={{ display: 'flex', gap: '20px', marginTop: '30px', alignItems: 'center', background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '20px' }}>
              <button onClick={() => setCurrentPhotoIndex(prev => prev > 0 ? prev - 1 : viewerPhotos.length - 1)} style={{ padding: '12px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: '1rem' }}>◀ 이전 사진</button>
              <span style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', minWidth: '60px', textAlign: 'center' }}>{currentPhotoIndex + 1} / {viewerPhotos.length}</span>
              <button onClick={() => setCurrentPhotoIndex(prev => prev < viewerPhotos.length - 1 ? prev + 1 : 0)} style={{ padding: '12px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: '1rem' }}>다음 사진 ▶</button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: window.innerWidth < 600 ? '15px' : '30px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1', background: '#fff', padding: window.innerWidth < 600 ? '20px' : '30px', borderRadius: '25px', boxShadow: '0 5px 20px rgba(0,0,0,0.05)', minWidth: window.innerWidth < 850 ? '100%' : '400px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#0f172a', fontSize: '1.4rem', marginBottom: '20px', borderLeft: '6px solid #2563eb', paddingLeft: '15px', fontWeight: '900' }}>⚙️ 시험 기간 외부인 통제</h2>
          <div style={{ background: isExamActive ? '#eff6ff' : '#f8fafc', padding: window.innerWidth < 600 ? '15px' : '25px', borderRadius: '20px', border: `2px solid ${isExamActive ? '#3b82f6' : '#e2e8f0'}`, transition: 'all 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <strong style={{ fontSize: '1rem', color: '#1e293b', fontWeight: '900' }}>🎓 시험 기간 모드</strong>
              <span style={{ background: isExamActive ? '#2563eb' : '#f1f5f9', color: isExamActive ? '#fff' : '#64748b', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '900' }}>{isExamActive ? '가동 중' : '일반 모드'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '25px' }}>
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '900', color: '#475569' }}>시작 일시</label>
                <button onClick={() => openPicker('start')} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #cbd5e1', background: isExamActive ? '#e2e8f0' : '#fff', color: examStartDate ? '#0f172a' : '#94a3b8', fontWeight: '900', fontSize: '1rem', textAlign: 'left', cursor: isExamActive ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {examStartDate ? examStartDate.replace('T', ' ') : '선택해주세요'} <span style={{fontSize:'1.2rem'}}>📅</span>
                </button>
              </div>
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '900', color: '#475569' }}>종료 일시</label>
                <button onClick={() => openPicker('end')} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #cbd5e1', background: isExamActive ? '#e2e8f0' : '#fff', color: examEndDate ? '#0f172a' : '#94a3b8', fontWeight: '900', fontSize: '1rem', textAlign: 'left', cursor: isExamActive ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {examEndDate ? examEndDate.replace('T', ' ') : '선택해주세요'} <span style={{fontSize:'1.2rem'}}>📅</span>
                </button>
              </div>
            </div>
            <button onClick={() => { if (window.confirm(isExamActive ? "해제하시겠습니까?" : "시작하시겠습니까?")) isExamActive ? clearExamPeriod() : saveExamPeriod(); }} style={{ width: '100%', padding: '16px', background: isExamActive ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)' }}>
              {isExamActive ? '❌ 통제 해제' : '✅ 설정 저장 및 통제 시작'}
            </button>
          </div>
        </div>
        <div style={{ flex: '1.5', background: '#fff', padding: window.innerWidth < 600 ? '20px' : '30px', borderRadius: '25px', boxShadow: '0 5px 20px rgba(0,0,0,0.05)', minWidth: window.innerWidth < 600 ? '100%' : '500px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#0f172a', fontSize: window.innerWidth < 600 ? '1.2rem' : '1.5rem', marginBottom: '20px', borderLeft: '6px solid #2563eb', paddingLeft: '15px', fontWeight: '900' }}>📈 일별 이용 현황 (퇴실 기준)</h2>
          <div style={{ height: window.innerWidth < 600 ? '200px' : '280px' }}> <Bar data={chartData} options={{ maintainAspectRatio: false }} /> </div>
        </div>
      </div>

      <div style={{ background: '#fff', padding: window.innerWidth < 600 ? '20px' : '40px', borderRadius: '25px', boxShadow: '0 5px 20px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' }}>
        
        <div style={{ display: 'flex', marginBottom: '25px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '4px', boxSizing: 'border-box', overflow: 'hidden', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('REPORTS')} style={{ flex: '1 1 0%', padding: '12px 10px', borderRadius: '8px', border: 'none', background: activeTab === 'REPORTS' ? '#dc2626' : 'transparent', color: activeTab === 'REPORTS' ? '#fff' : '#64748b', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: activeTab === 'REPORTS' ? '0 2px 8px rgba(220, 38, 38, 0.4)' : 'none' }}>🚨 수동 신고 관리 ({reportsList.length})</button>
          <button onClick={() => setActiveTab('APPEALS')} style={{ flex: '1 1 0%', padding: '12px 10px', borderRadius: '8px', border: 'none', background: activeTab === 'APPEALS' ? '#059669' : 'transparent', color: activeTab === 'APPEALS' ? '#fff' : '#64748b', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: activeTab === 'APPEALS' ? '0 2px 8px rgba(5, 150, 105, 0.4)' : 'none' }}>🤖 AI 소명/신고 접수 ({aiAppealsList.filter(a => a.status !== 'RESOLVED').length})</button>
          <button onClick={() => setActiveTab('USERS')} style={{ flex: '1 1 0%', padding: '12px 10px', borderRadius: '8px', border: 'none', background: activeTab === 'USERS' ? '#2563eb' : 'transparent', color: activeTab === 'USERS' ? '#fff' : '#64748b', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: activeTab === 'USERS' ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none' }}>👥 전체 회원 목록</button>
        </div>

        {activeTab === 'REPORTS' && (
          <div style={{overflowX: 'auto', width: '100%', borderRadius: '15px', border: '1px solid #e2e8f0', minHeight: '400px', background: '#fff'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px', tableLayout: 'fixed'}}>
              <thead>
                <tr style={{ background: '#fef2f2', borderBottom: '3px solid #fecaca' }}>
                  <th style={{padding: '15px', width: '140px', color: '#dc2626', fontWeight: '900'}}>피신고자</th>
                  <th style={{padding: '15px', width: '200px', color: '#dc2626', fontWeight: '900'}}>신고 사유</th>
                  <th style={{padding: '15px', width: '100px', color: '#dc2626', fontWeight: '900'}}>좌석</th>
                  <th style={{padding: '15px', width: '140px', color: '#dc2626', fontWeight: '900'}}>신고자</th>
                  <th style={{padding: '15px', width: '170px', color: '#dc2626', fontWeight: '900'}}>증거 사진</th>
                  <th style={{padding: '15px', width: '150px', color: '#dc2626', fontWeight: '900'}}>조치</th>
                </tr>
              </thead>
              <tbody>
                {reportsList.length === 0 ? ( <tr><td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontWeight: '700' }}>현재 접수된 신고가 없습니다.</td></tr> ) : reportsList.map(r => {
                  
                  const isCleanCheck = r.action === 'CHECK_IN_CLEAN_REPORT';
                  const reasonText = r.result || r.reason || r.issues?.join(', ') || '사유 없음';
                  const photos = r.mediaUrls || r.payload?.mediaUrls || r.reportPayload?.mediaUrls || [];

                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', background: isCleanCheck ? '#fffbeb' : '#fff' }}>
                      <td style={{ padding: '15px', fontWeight: '800', color: '#0f172a' }}>
                        {r.realName} {r.studentNo && r.studentNo !== '정보 없음' && <span style={{color:'#64748b', fontSize:'0.8rem', display: 'block'}}>({r.studentNo})</span>}
                      </td>
                      <td style={{ padding: '15px', fontWeight: '700', color: '#475569' }}>
                        {isCleanCheck && <span style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginRight: '6px' }}>클린체크</span>}
                        {reasonText}
                      </td>
                      <td style={{ padding: '15px', fontWeight: '800', color: '#2563eb' }}>{r.seatLabel || r.seatId || '-'}</td>
                      <td style={{ padding: '15px', fontWeight: '800', color: '#0f172a' }}>
                        {r.reporterName} {r.reporterNo && <span style={{color:'#94a3b8', fontSize:'0.8rem', display: 'block'}}>({r.reporterNo})</span>}
                      </td>
                      
                      <td style={{ padding: '15px' }}>
                        {photos.length > 0 ? (
                          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                            {photos.map((url, i) => (
                              <img 
                                key={i} 
                                src={url} 
                                alt="증거" 
                                onClick={() => openViewer(photos, i)}
                                style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid #cbd5e1', flexShrink: 0, transition: '0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                              />
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}>사진 없음</span>
                        )}
                      </td>

                      <td style={{ padding: '15px', display: 'flex', gap: '8px' }}>
                        <button onClick={() => setActionReport(r)} style={{ padding: '8px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>조치하기</button>
                        <button onClick={() => handleDismissReport(r.id)} style={{ padding: '8px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>반려</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 🤖 탭 2: AI 접수 내역 */}
        {activeTab === 'APPEALS' && (
          <div style={{overflowX: 'auto', width: '100%', borderRadius: '15px', border: '1px solid #e2e8f0', minHeight: '400px', background: '#fff'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px', tableLayout: 'fixed'}}>
              <thead>
                <tr style={{ background: '#ecfdf5', borderBottom: '3px solid #a7f3d0' }}>
                  <th style={{padding: '15px', width: '120px', color: '#059669', fontWeight: '900'}}>접수자(학번)</th>
                  <th style={{padding: '15px', width: '300px', color: '#059669', fontWeight: '900'}}>상세 내용 (AI를 통해 전달됨)</th>
                  <th style={{padding: '15px', width: '130px', color: '#059669', fontWeight: '900'}}>접수일시</th>
                  <th style={{padding: '15px', width: '100px', color: '#059669', fontWeight: '900'}}>상태</th>
                  <th style={{padding: '15px', width: '150px', color: '#059669', fontWeight: '900'}}>관리 액션</th>
                </tr>
              </thead>
              <tbody>
                {aiAppealsList.length === 0 ? ( <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontWeight: '700' }}>현재 AI를 통해 접수된 내역이 없습니다.</td></tr> ) : aiAppealsList.map(a => {
                  
                  const timeObj = a.createdAt || a.timestamp;
                  const dateStr = timeObj ? (timeObj.toDate ? timeObj.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date(timeObj).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '방금 전';

                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #e2e8f0', background: a.status === 'RESOLVED' ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '15px', fontWeight: '800', color: '#0f172a' }}>{a.userId?.split('@')[0] || '익명'}</td>
                      <td style={{ padding: '15px', fontWeight: '700', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{a.content}</td>
                      <td style={{ padding: '15px', fontWeight: '800', color: '#64748b', fontSize: '0.85rem' }}>{dateStr}</td>
                      <td style={{ padding: '15px', fontWeight: '900', color: a.status === 'RESOLVED' ? '#10b981' : '#f59e0b' }}>
                        {a.status === 'RESOLVED' ? '✅ 확인완료' : '⏳ 대기중'}
                      </td>
                      <td style={{ padding: '15px', display: 'flex', gap: '8px' }}>
                        {a.status !== 'RESOLVED' && (
                          <button onClick={() => handleResolveAppeal(a.id)} style={{ padding: '8px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>확인처리</button>
                        )}
                        <button onClick={() => handleDeleteAppeal(a.id)} style={{ padding: '8px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>삭제</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 👥 탭 3: 전체 회원 목록 */}
        {activeTab === 'USERS' && (
          <>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <input type="text" placeholder="학번 또는 이름으로 검색..." value={tempSearch} onChange={(e) => setTempSearch(e.target.value)} style={{ width: '100%', maxWidth: '300px', padding: '12px 15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '0.95rem', fontWeight: '700', outline: 'none' }} />
            </div>
            <div style={{overflowX: 'auto', width: '100%', borderRadius: '15px', border: '1px solid #e2e8f0', minHeight: '600px', background: '#fff'}}>
              <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px', tableLayout: 'fixed'}}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '3px solid #cbd5e1' }}>
                    <th style={{padding: '15px', width: '130px', color: '#0f172a', fontWeight: '900'}}>학번</th>
                    <th style={{padding: '15px', width: '100px', color: '#0f172a', fontWeight: '900'}}>이름</th>
                    <th style={{padding: '15px', width: '100px', color: '#0f172a', fontWeight: '900'}}>이용 횟수</th>
                    <th style={{padding: '15px', width: '220px', color: '#dc2626', fontWeight: '900'}}>누적 사고(취소/제재)</th>
                    <th style={{padding: '15px', width: '100px', color: '#2563eb', fontWeight: '900'}}>패널티 초기화</th>
                    <th style={{padding: '15px', width: '180px', color: '#b91c1c', fontWeight: '900'}}>정지 기한</th>
                    <th style={{padding: '15px', width: '120px', color: '#0f172a', fontWeight: '900'}}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.filter(u => !['pjy', 'admin', 'manager', '1111111', '관리자'].includes(u.studentNo)).filter(u => (u.studentNo || '').includes(debouncedSearch) || (u.name || '').includes(debouncedSearch)).map((u) => {
                    const isSuspended = u.penaltyUntil && now < (u.penaltyUntil.toDate ? u.penaltyUntil.toDate() : new Date(u.penaltyUntil));
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0', background: isSuspended ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: '15px', fontWeight: '800' }}>{u.studentNo}</td>
                        <td style={{ padding: '15px', fontWeight: '900' }}>{u.name}</td>
                        <td style={{ padding: '15px', fontWeight: '800', color: '#2563eb' }}>{u.totalUsageCount || 0}회</td>
                        <td style={{ padding: '15px', fontWeight: '800', color: '#dc2626' }}>취소 {u.cancelCount || 0} / 제재 {u.penaltyCount || 0}단계</td>
                        <td style={{ padding: '15px', fontWeight: '900', color: '#2563eb' }}>{u.resetCount || 0}회</td>
                        <td style={{ padding: '15px', fontWeight: '900', color: isSuspended ? '#b91c1c' : '#94a3b8' }}>
                          {isSuspended ? (u.penaltyUntil.toDate ? u.penaltyUntil.toDate().toLocaleString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date(u.penaltyUntil).toLocaleString()) : '-'}
                        </td>
                        <td style={{ padding: '15px', display: 'flex', gap: '8px' }}>
                          {isSuspended && (<button onClick={() => handleResetPenaltyOnly(u.studentNo, u.name)} style={{ padding: '6px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '900', cursor: 'pointer', fontSize: '0.8rem' }}>사면 처리</button>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}