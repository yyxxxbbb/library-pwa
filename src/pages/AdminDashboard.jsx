import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { ReportDetailModal, AdminActionModal, reportService } from '../components/ReportModule';
import { 
  collection, getDocs, doc, updateDoc, increment, setDoc, getDoc, 
  deleteDoc, addDoc, serverTimestamp, onSnapshot, query, where 
} from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function AdminDashboard() {
  // --- [기존 상태 관리] ---
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ daily: {}, weekly: {}, monthly: {} });
  const [currentDate, setCurrentDate] = useState(new Date());

  // --- [신규 신고 관리 상태] ---
  const [filterStatus, setFilterStatus] = useState('PENDING'); // PENDING, PROCESSING, COMPLETED
  const [reportsList, setReportsList] = useState([]);
  const [detailModal, setDetailModal] = useState(null); 
  const [actionReport, setActionReport] = useState(null); 
  const [reportFilterDate, setReportFilterDate] = useState(""); // 신고 내역 날짜 필터 (YYYY-MM-DD 형식)

  // 1. 회원 목록 및 통계 데이터 실시간 감시 (기존 로직)
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "User"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubLogs = onSnapshot(collection(db, "Log"), (snap) => {
      const logs = snap.docs.map(d => d.data());
      const daily = {};
      logs.forEach(log => {
        if (log.action === 'CHECK_IN' && log.createdAt) {
          const date = format(log.createdAt.toDate(), 'yyyy-MM-dd');
          daily[date] = (daily[date] || 0) + 1;
        }
      });
      setStats(prev => ({ ...prev, daily }));
    });

    return () => { unsubUsers(); unsubLogs(); };
  }, []);

  // 2. 신고 내역 실시간 감시 (신규 로직)
  useEffect(() => {
    const q = query(
      collection(db, 'Log'), 
      where('action', 'in', ['USER_REPORTED', 'ADMIN_PENALTY', 'REPORT_COMPLETED'])
    );

    const unsubReports = onSnapshot(q, (snap) => {
      const reports = snap.docs.map(doc => {
        const data = doc.data();
        let status = data.reportStatus;
        if (!status) {
          if (data.action === 'USER_REPORTED') status = 'PENDING';
          else if (data.action === 'ADMIN_PENALTY') status = 'PROCESSING';
          else if (data.action === 'REPORT_COMPLETED') status = 'COMPLETED';
        }
        return { id: doc.id, ...data, reportStatus: status };
      })
      .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setReportsList(reports);
    });
    return () => unsubReports();
  }, []);

  // --- [기존 회원 관리 함수들] ---
  const handleResetPenaltyOnly = async (studentNo, name) => {
    if (!window.confirm(`${name}(${studentNo}) 학생의 이용 정지를 즉시 해제하시겠습니까?`)) return;
    try {
      await updateDoc(doc(db, "User", studentNo), { penaltyUntil: null });
      alert("✅ 이용 정지가 해제되었습니다.");
    } catch (e) { alert("오류 발생"); }
  };

  const handleResetUsage = async (studentNo, name) => {
    if (!window.confirm(`${name}(${studentNo}) 학생의 모든 이용 기록(패널티/취소/횟수)을 초기화하시겠습니까?`)) return;
    try {
      await updateDoc(doc(db, "User", studentNo), {
        penaltyCount: 0, cancelCount: 0, totalUsageCount: 0, resetCount: increment(1), penaltyUntil: null
      });
      alert("✅ 모든 기록이 초기화되었습니다.");
    } catch (e) { alert("오류 발생"); }
  };

  const handleFinalize = async (report, outcome) => {
    const confirmMsg = outcome === 'PARDON' ? "사면 처리하시겠습니까?" : "최종 확정하시겠습니까?";
    if (!window.confirm(confirmMsg)) return;
    const success = await reportService.finalizeReport(report.id, outcome);
    if(success) alert("사건이 종결되었습니다.");
  };

  const handleDismissReport = async (id) => {
    if (!window.confirm("이 신고를 반려하시겠습니까?")) return;
    const success = await reportService.dismissReport(id);
    if(success) alert("반려되었습니다.");
  };

  // --- [차트 데이터 준비] ---
  const days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
  const chartData = {
    labels: days.map(d => format(d, 'MM/dd(eee)')),
    datasets: [{
      label: '일별 입실 인원',
      data: days.map(d => stats.daily[format(d, 'yyyy-MM-dd')] || 0),
      backgroundColor: '#2563eb',
      borderRadius: 8,
    }]
  };

  const filteredUsers = users.filter(u => 
    u.name?.includes(search) || u.studentNo?.includes(search)
  );

  return (
    <div style={{ padding: '25px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      
      {/* 1. 상단 통계 차트 섹션 */}
      <div style={{ background: '#fff', padding: '25px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontWeight: '900', fontSize: '1.3rem' }}>📈 주간 이용 통계</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>이전달</button>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>다음달</button>
          </div>
        </div>
        <div style={{ height: '300px' }}>
          <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
        </div>
      </div>

      {/* 2. 신고 내역 관리 섹션 */}
      <div style={{ marginBottom: '40px' }}>
        
        {/* 🔥 타이틀, 탭, 날짜 필터를 양옆으로 깔끔하게 배치하는 컨테이너 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
          
          <div>
            <h3 style={{ fontWeight: '900', fontSize: '1.4rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🚨 실시간 신고/소명 관리
            </h3>
            <div style={{ display: 'flex', gap: '10px', background: '#e2e8f0', padding: '5px', borderRadius: '15px', width: 'fit-content' }}>
              {[
                { id: 'PENDING', label: '접수 대기', color: '#dc2626' },
                { id: 'PROCESSING', label: '진행 중', color: '#2563eb' },
                { id: 'COMPLETED', label: '완료됨', color: '#16a34a' }
              ].map(tab => {
                const hasNewItem = 
                  (tab.id === 'PENDING' && reportsList.some(r => r.reportStatus === 'PENDING' || r.action === 'USER_REPORTED')) ||
                  (tab.id === 'PROCESSING' && reportsList.some(r => r.reportStatus === 'PROCESSING' && r.appealText));

                return (
                  <button 
                    key={tab.id} 
                    onClick={() => setFilterStatus(tab.id)} 
                    style={{
                      position: 'relative',
                      padding: '10px 20px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer',
                      background: filterStatus === tab.id ? tab.color : 'transparent',
                      color: filterStatus === tab.id ? '#fff' : '#64748b',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab.label}
                    {hasNewItem && (
                      <span style={{ 
                        position: 'absolute', 
                        top: '2px', 
                        right: '2px', 
                        width: '10px', 
                        height: '10px', 
                        background: '#ef4444', 
                        borderRadius: '50%', 
                        border: '2px solid #fff',
                        boxShadow: '0 0 5px rgba(239, 68, 68, 0.5)'
                      }}></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '10px 15px', borderRadius: '15px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <label style={{ fontWeight: '800', fontSize: '0.9rem', color: '#475569' }}>📅 날짜 필터:</label>
            <input 
              type="date" 
              value={reportFilterDate} 
              onChange={(e) => setReportFilterDate(e.target.value)} 
              style={{ 
                padding: '8px 12px', 
                borderRadius: '8px', 
                border: '1px solid #cbd5e1', 
                outline: 'none', 
                fontWeight: '900', 
                color: '#000000',
                backgroundColor: '#ffffff',
                colorScheme: 'light',
                fontSize: '0.95rem' 
              }} 
            />
            {reportFilterDate && (
              <button 
                onClick={() => setReportFilterDate("")} 
                style={{ background: '#f1f5f9', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', color: '#64748b', fontSize: '0.8rem' }}
              >
                초기화
              </button>
            )}
          </div>

        </div>

        <div style={{ background: '#fff', borderRadius: '24px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '900' }}>일시</th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '900' }}>피의자</th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '900' }}>내용 확인</th>
                <th style={{ padding: '15px', textAlign: 'center', fontWeight: '900' }}>조치</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const statusFiltered = reportsList.filter(r => r.reportStatus === filterStatus);
                
                const finalFiltered = statusFiltered.filter(r => {
                  if (!reportFilterDate) return true;
                  if (!r.createdAt?.toDate) return false;
                  const itemDate = format(r.createdAt.toDate(), 'yyyy-MM-dd');
                  return itemDate === reportFilterDate;
                });

                if (finalFiltered.length === 0) {
                  return (
                    <tr>
                      <td colSpan="4" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8', fontWeight: '700' }}>
                        {reportFilterDate ? `${reportFilterDate}에 해당하는 내역이 없습니다.` : '해당 내역이 없습니다.'}
                      </td>
                    </tr>
                  );
                }

                return finalFiltered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '15px', fontSize: '0.85rem', color: '#64748b' }}>
                      {r.createdAt?.toDate?.().toLocaleString('ko-KR')}
                    </td>
                    <td style={{ padding: '15px', fontWeight: '800' }}>
                      {r.studentNo || r.uid?.split('@')[0]} <span style={{ color: '#2563eb' }}>({r.seatLabel})</span>
                    </td>
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setDetailModal({ title: '신고 내용', reason: r.result, content: r.reportDetails || r.result, type: 'REPORT' })} style={{ color: '#000', padding: '6px 10px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}>
                          신고내용
                        </button>
                        {r.appealText && (
                          <button onClick={() => setDetailModal({ title: '소명 내용', reason: r.result, content: r.appealText, type: 'APPEAL' })} style={{ padding: '6px 10px', background: '#fffbeb', border: '1px solid #f59e0b', color: '#b45309', borderRadius: '6px', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}>
                            소명확인
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      {filterStatus === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                          <button onClick={() => setActionReport(r)} style={{ padding: '8px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>조치하기</button>
                          <button onClick={() => handleDismissReport(r.id)} style={{ color: '#000', padding: '8px 12px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>반려</button>
                        </div>
                      )}
                      {filterStatus === 'PROCESSING' && (
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                          <button onClick={() => handleFinalize(r, 'PARDON')} style={{ padding: '8px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.8rem' }}>사면</button>
                          <button onClick={() => handleFinalize(r, 'CONFIRMED')} style={{ padding: '8px 12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.8rem' }}>종결</button>
                        </div>
                      )}
                      {filterStatus === 'COMPLETED' && (
                        <span style={{ fontWeight: '900', color: r.finalOutcome === 'PARDON' ? '#10b981' : '#64748b' }}>
                          {r.finalOutcome === 'PARDON' ? '사면됨' : '조치완료'}
                        </span>
                      )}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 회원 관리 테이블 섹션 (기존의 방대한 리스트) */}
      <div style={{ background: '#fff', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontWeight: '900', fontSize: '1.3rem' }}>👥 회원 관리 및 제재 현황</h3>
          <input type="text" placeholder="학번 또는 이름 검색..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ color: '#000', background: '#f8fafc', padding: '12px 20px', borderRadius: '12px', border: '2px solid #e2e8f0', width: '250px', outline: 'none' }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr style={{ color: '#64748b', fontSize: '0.9rem' }}>
                <th style={{ padding: '15px', textAlign: 'left' }}>학번</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>이름</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>누적 이용</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>제재 단계</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>기능</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isSuspended = u.penaltyUntil && u.penaltyUntil.toDate ? u.penaltyUntil.toDate() > new Date() : false;
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '15px', fontWeight: '800' }}>{u.studentNo}</td>
                    <td style={{ padding: '15px', fontWeight: '900' }}>{u.name}</td>
                    <td style={{ padding: '15px', fontWeight: '800', color: '#2563eb' }}>{u.totalUsageCount || 0}회</td>
                    <td style={{ padding: '15px', fontWeight: '800', color: isSuspended ? '#dc2626' : '#94a3b8' }}>
                      {isSuspended ? '⚠️ 정지 중' : `${u.penaltyCount || 0}단계`}
                    </td>
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {isSuspended && <button onClick={() => handleResetPenaltyOnly(u.studentNo, u.name)} style={{ padding: '6px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}>정지해제</button>}
                        <button onClick={() => handleResetUsage(u.studentNo, u.name)} style={{ padding: '6px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}>전체초기화</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    <ReportDetailModal detailModal={detailModal} onClose={() => setDetailModal(null)} />
    <AdminActionModal actionReport={actionReport} onClose={() => setActionReport(null)} onSubmitSuccess={() => setFilterStatus('PROCESSING')} />
    </div>
  );
}