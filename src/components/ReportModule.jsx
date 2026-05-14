import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// ==========================================
// 1. 공통 상수 (Constants)
// ==========================================
export const REPORT_CATEGORIES = [
  '단순 노쇼 (1시간 이상 자리 비움)',
  '소음 발생 (대화, 전자기기 등)',
  '청결 상태 불량 (쓰레기 방치 등)',
  '사석화 (짐만 두고 장기 이탈)',
  '기타 (직접 입력)'
];

export const ADMIN_ACTION_OPTIONS = [
  { value: 'WARNING', label: '단순 경고 (이용 정지 없음)' },
  { value: 'SUSPEND_1', label: '1일 이용 정지' },
  { value: 'SUSPEND_3', label: '3일 이용 정지' },
  { value: 'SUSPEND_7', label: '7일 이용 정지' },
  { value: 'SUSPEND_30', label: '30일 이용 정지' }
];

// ==========================================
// 2. 파이어베이스 데이터 처리 서비스 (API)
// ==========================================
export const reportService = {
  // [사용자] 신고 제출
  submitUserReport: async ({ selectedSeat, reportTarget, reporterEmail, category, details }) => {
    try {
      await addDoc(collection(db, "Log"), {
        action: 'USER_REPORTED', 
        reportStatus: 'PENDING',
        seatId: selectedSeat.id, 
        seatLabel: selectedSeat.label || selectedSeat.id,
        uid: reportTarget.uid || reportTarget,
        studentNo: reportTarget.studentNo || reportTarget.uid?.split('@')[0] || reportTarget,
        reporter: reporterEmail, 
        result: category,
        reportDetails: details,
        createdAt: serverTimestamp()
      });
      return true;
    } catch(e) { 
      console.error("신고 제출 오류:", e);
      return false; 
    }
  },

  // [사용자] 소명 자료 제출
  submitUserAppeal: async (alertId, appealText) => {
    try {
      await updateDoc(doc(db, "Log", alertId), {
        appealText: appealText,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error("소명 제출 오류:", e);
      return false;
    }
  },

  // [관리자] 조치하기 (PENDING -> PROCESSING)
  submitAdminAction: async (reportId, actionType) => {
    try {
      await updateDoc(doc(db, "Log", reportId), {
        action: 'ADMIN_PENALTY',
        reportStatus: 'PROCESSING', 
        adminActionType: actionType,
        processedAt: serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error("조치 오류:", e);
      return false;
    }
  },

  // [관리자] 최종 종결 및 사면 (PROCESSING -> COMPLETED)
  finalizeReport: async (reportId, outcome) => {
    try {
      await updateDoc(doc(db, "Log", reportId), {
        reportStatus: 'COMPLETED',
        action: 'REPORT_COMPLETED',
        finalOutcome: outcome,
        completedAt: serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error("종결 오류:", e);
      return false;
    }
  },

  // [관리자] 신고 반려 (삭제)
  dismissReport: async (reportId) => {
    try {
      await deleteDoc(doc(db, "Log", reportId));
      return true;
    } catch (e) {
      console.error("반려 오류:", e);
      return false;
    }
  }
};

// ==========================================
// 3. UI 컴포넌트: [SeatModal] 신고 제출 팝업
// ==========================================
export const ReportSubmitModal = ({ isOpen, onClose, reportTarget, selectedSeat, reporterEmail }) => {
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
  const [reportDetails, setReportDetails] = useState('');

  if (!isOpen || !reportTarget) return null;

  const handleSubmit = async () => {
    if (!reportDetails.trim()) return alert("상황을 입력해주세요.");
    const success = await reportService.submitUserReport({ selectedSeat, reportTarget, reporterEmail, category: reportCategory, details: reportDetails });
    if (success) {
      alert("✅ 신고가 접수되었습니다.");
      setReportDetails('');
      onClose();
    } else {
      alert("오류가 발생했습니다.");
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.98)', zIndex: 20, display: 'flex', flexDirection: 'column', padding: '30px', boxSizing: 'border-box', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', overflowY: 'auto' }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#dc2626', fontWeight: '900', fontSize: '1.4rem' }}>🚨 사용자 신고하기</h3>
      <p style={{ margin: '0 0 15px 0', color: '#475569', fontSize: '0.9rem', fontWeight: '700' }}>대상자: <strong style={{color: '#0f172a'}}>{reportTarget.studentNo || reportTarget.uid?.split('@')[0]}</strong></p>

      <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#dc2626', fontWeight: '800' }}>💡 신고 가이드</p>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#475569', lineHeight: '1.4', fontWeight: '600' }}>
          <li>1시간 이상 자리를 비운 경우</li>
          <li>심한 소음으로 방해하는 경우</li>
        </ul>
      </div>

      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '900', color: '#0f172a' }}>분류 선택</label>
      <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0', background: '#ffffff', color: '#0f172a', marginBottom: '15px', fontSize: '0.95rem', fontWeight: '700', outline: 'none', cursor: 'pointer' }}>
        {REPORT_CATEGORIES.map(cat => (<option key={cat} value={cat} style={{ background: '#ffffff', color: '#0f172a' }}>{cat}</option>))}
      </select>
      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '900', color: '#0f172a' }}>상세 기록</label>
      <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="피해 내용을 상세히 적어주세요." style={{ width: '100%', flex: 1, minHeight: '100px', padding: '15px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#f8fafc', marginBottom: '20px', resize: 'none', fontSize: '0.95rem', fontWeight: '600', color: '#000000', outline: 'none', boxSizing: 'border-box' }} />
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onClose} style={{ flex: 1, padding: '16px', background: '#e2e8f0', color: '#000000', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>취소</button>
        <button onClick={handleSubmit} style={{ flex: 2, padding: '16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>신고서 제출</button>
      </div>
    </div>
  );
};

// ==========================================
// 4. UI 컴포넌트: [App] 패널티 알림 및 소명 팝업
// ==========================================
export const PenaltyAppealModal = ({ penaltyAlert, onDismiss, userEmail }) => {
  const [appealText, setAppealText] = useState("");

  if (!penaltyAlert) return null;

  const handleSubmit = async () => {
    if (!appealText.trim()) return alert("소명 내용을 입력해주세요.");
    const success = await reportService.submitUserAppeal(penaltyAlert.id, appealText);
    
    if (success) {
      alert("✅ 소명 자료가 관리자에게 성공적으로 전달되었습니다.");
      setAppealText("");
      onDismiss();
    } else {
      alert(`🚨 제출 실패! 관리자에게 문의해주세요.`); 
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.85)', zIndex: 999999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '450px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', overflowY: 'auto', maxHeight: '90vh' }}>
        <div style={{ fontSize: '3rem', marginBottom: '5px' }}>🚨</div>
        <h2 style={{ margin: '0 0 15px 0', color: '#dc2626', fontWeight: '900', fontSize: '1.5rem', wordBreak: 'keep-all' }}>
          {penaltyAlert.action === 'USER_REPORTED' ? '도서관 이용 수칙 위반 신고 접수' : '도서관 이용 제한(패널티) 안내'}
        </h2>
        
        {penaltyAlert.action === 'USER_REPORTED' && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '15px', borderRadius: '12px', marginBottom: '15px', textAlign: 'left' }}>
            <p style={{ margin: '0 0 5px 0', color: '#b45309', fontSize: '0.9rem', fontWeight: '900' }}>⏳ 이중 소명 프로세스 (72시간)</p>
            <p style={{ margin: 0, color: '#92400e', fontSize: '0.85rem', fontWeight: '700', lineHeight: '1.4' }}>
              해당 알림 시점으로부터 72시간 내에 반박/소명 자료를 제출하지 않으시면 관리자 검토 후 패널티가 최종 확정됩니다.
            </p>
          </div>
        )}

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '15px', textAlign: 'left', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#7f1d1d', fontWeight: '800' }}>📌 발생 좌석: <span style={{ color: '#dc2626', fontWeight: '900' }}>{penaltyAlert.seatLabel}</span></p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#7f1d1d', fontWeight: '800', lineHeight: '1.4' }}>📌 신고 내용:<br/><span style={{ color: '#dc2626', fontWeight: '900' }}>{penaltyAlert.result}</span></p>
        </div>
        
        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '900', color: '#475569', marginBottom: '8px' }}>🙋‍♂️ 반박/소명 자료 제출 (선택)</label>
          <textarea 
            value={appealText} 
            onChange={(e) => setAppealText(e.target.value)} 
            placeholder="당시 상황에 대한 설명이나 억울한 점을 적어주세요." 
            style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem', minHeight: '100px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontWeight: '600', color: '#000000' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onDismiss} style={{ flex: 1, padding: '16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '1rem', cursor: 'pointer' }}>확인 (닫기)</button>
          <button onClick={handleSubmit} style={{ flex: 2, padding: '16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)' }}>소명 자료 제출하기</button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. UI 컴포넌트: [Admin] 신고 상세 및 소명 확인 모달
// ==========================================
export const ReportDetailModal = ({ detailModal, onClose }) => {
  if (!detailModal) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid #cbd5e1' }}>
        <h3 style={{ textAlign: 'center', color: detailModal.type === 'REPORT' ? '#dc2626' : '#b45309', margin: '0 0 25px 0', fontSize: '1.5rem', fontWeight: '900' }}>{detailModal.title}</h3>
        <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '14px', border: '2px solid #e2e8f0', marginBottom: '20px' }}>
          <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '900', display: 'block', marginBottom: '6px' }}>📋 신고 사유 (분류)</span>
          <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#000000' }}>{detailModal.reason}</p>
        </div>
        <div style={{ background: detailModal.type === 'REPORT' ? '#fff1f1' : '#fffbeb', padding: '20px', borderRadius: '14px', border: `2px solid ${detailModal.type === 'REPORT' ? '#fca5a5' : '#fcd34d'}`, maxHeight: '280px', overflowY: 'auto', marginBottom: '25px' }}>
          <span style={{ fontSize: '0.85rem', color: detailModal.type === 'REPORT' ? '#991b1b' : '#92400e', fontWeight: '900', display: 'block', marginBottom: '10px' }}>{detailModal.type === 'REPORT' ? '신고 상세 기록' : '사용자 소명 내용'}</span>
          <div style={{ fontSize: '1rem', color: '#000000', fontWeight: '700', lineHeight: '1.7', wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}>{detailModal.content}</div>
        </div>
        <button onClick={onClose} style={{ width: '100%', padding: '16px', background: '#334155', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem' }}>확인 후 닫기</button>
      </div>
    </div>
  );
};

// ==========================================
// 6. UI 컴포넌트: [Admin] 신고 조치하기 모달
// ==========================================
export const AdminActionModal = ({ actionReport, onClose, onSubmitSuccess }) => {
  const [actionType, setActionType] = useState('WARNING');

  if (!actionReport) return null;

  const handleSubmit = async () => {
    const success = await reportService.submitAdminAction(actionReport.id, actionType);
    if (success) {
      alert("✅ 조치 완료! 진행 중 탭에서 확인 가능하며 피신고자가 소명을 제출할 수 있습니다.");
      onSubmitSuccess();
      onClose();
    } else {
      alert("조치 중 오류 발생");
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '400px' }}>
        <h3 style={{ margin: '0 0 20px 0', fontWeight: '900', color: '#dc2626', textAlign: 'center' }}>🚨 신고 조치하기</h3>
        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#475569' }}>대상: <b>{actionReport.studentNo || actionReport.uid?.split('@')[0]}</b></p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>사유: <b>{actionReport.result}</b></p>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ color:'#475569', display: 'block', marginBottom: '10px', fontWeight: '900' }}>조치 방법 선택</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={{ color:'#000', width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', fontWeight: '900', background: '#fff', outline: 'none' }}>
            {ADMIN_ACTION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ color:'#000', flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#e2e8f0', fontWeight: '900', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSubmit} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: '900', cursor: 'pointer' }}>조치 완료</button>
        </div>
      </div>
    </div>
  );
};