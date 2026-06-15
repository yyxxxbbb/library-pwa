import React, { useState } from 'react';
import { auth, db } from '../firebase'; 
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore'; 

const Auth = ({ isExamPeriod }) => {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState(''); 
  const [name, setName] = useState('');
  
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  
  const [resetStep, setResetStep] = useState(1);
  const [resetStudentId, setResetStudentId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const [signupType, setSignupType] = useState('SELECT');

  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자']; 

  // 1. 로그인 화면
  if (!isSignUpMode && !isForgotPasswordMode) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', textAlign: 'center', width: '380px', boxSizing: 'border-box' }}>
          
          {isExamPeriod && (
            <div style={{ background: '#ffffff', color: '#000000', padding: '15px', borderRadius: '15px', marginBottom: '25px', border: '3px solid red' }}>
              <h3 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem' }}>🚨 이용 제한 안내</h3>
              <p style={{ margin: '8px 0 0 0', fontWeight: '800', fontSize: '0.9rem', lineHeight: '1.4' }}>시험 기간 정책 가동 중으로<br/>외부인 이용이 금지됩니다.</p>
            </div>
          )}

          <h1 style={{ color: '#0f172a', marginBottom: '35px', fontWeight: '900', fontSize: '2.2rem' }}>도서관 예약</h1>
          
          <form 
            onSubmit={async (e) => {
              e.preventDefault(); 
              // 🚨 [에러 완벽 해결] DB를 훔쳐보지 않고, 학생/외부인 조합으로 연속 로그인 시도!
              try {
                // 1. 먼저 학생용(@test.com)으로 로그인 시도
                await signInWithEmailAndPassword(auth, `${studentId}@test.com`, password);
              } catch (err) {
                // 2. 실패 시 외부인용(@guest.com)으로 재시도
                try {
                  await signInWithEmailAndPassword(auth, `${studentId}@guest.com`, password);
                } catch (fallbackErr) {
                  // 3. 둘 다 실패하면 에러 띄우기
                  alert("❌ 학번(또는 연락처)이나 비밀번호가 틀립니다.");
                }
              }
            }} 
            style={{ margin: 0, padding: 0 }}
          >
            <input type="text" placeholder="학번(외부인은 연락처) 입력" onChange={e => setStudentId(e.target.value)} 
              style={{ width: '100%', padding: '18px', marginBottom: '15px', borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
            
            <input type="password" placeholder="비밀번호" onChange={e => setPassword(e.target.value)} 
              style={{ width: '100%', padding: '18px', marginBottom: '30px', borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
            
            <button type="submit"
              style={{ width: '100%', padding: '20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '1.2rem', transition: '0.2s' }}>로그인</button>
          </form>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
            <p onClick={() => setIsSignUpMode(true)} style={{ color: '#2563eb', cursor: 'pointer', fontWeight: '900', margin: 0 }}>회원가입</p>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <p onClick={() => setIsForgotPasswordMode(true)} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', margin: 0 }}>비밀번호 찾기</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. 회원가입 화면 (가짜 이메일 방식으로 원상 복구)
  if (isSignUpMode) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: '100vw', background: 'transparent', zIndex: 9999 }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', textAlign: 'center', width: '400px' }}>
          
          <h1 style={{ color: '#0f172a', marginBottom: '40px', fontWeight: '900', fontSize: '1.8rem' }}>
            {signupType === 'SELECT' ? '가입 유형 선택' : signupType === 'STUDENT' ? '🎓 학생 회원가입' : '👤 외부인 회원가입'}
          </h1>

          {signupType === 'SELECT' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', marginBottom: '35px' }}>
                <button onClick={() => setSignupType('STUDENT')} style={{ flex: 1, padding: '40px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s' }}>학생입니다</button>
                <button onClick={() => setSignupType('GUEST')} style={{ flex: 1, padding: '40px 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s' }}>외부인입니다</button>
              </div>
              <p onClick={() => { setIsSignUpMode(false); setSignupType('SELECT'); }} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', margin: 0 }}>취소</p>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="이름 입력" onChange={e => setName(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              <input type="text" placeholder={signupType === 'STUDENT' ? "학번 입력" : "연락처 (숫자만)"} onChange={e => setStudentId(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              <input type="password" placeholder="비밀번호 설정 (6자 이상)" onChange={e => setPassword(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              <input type="password" placeholder="비밀번호 확인" onChange={e => setPasswordConfirm(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              <button onClick={async () => {
                if (password !== passwordConfirm) return alert("❌ 비밀번호가 일치하지 않습니다.");
                if (password.length < 6) return alert("❌ 비밀번호는 6자 이상이어야 합니다.");

                try {
                  const emailSuffix = signupType === 'STUDENT' ? 'test.com' : 'guest.com';
                  const finalRole = signupType === 'GUEST' ? 'GUEST' : (ADMIN_IDS.includes(studentId) ? 'MANAGER' : 'CLIENT');
                  
                  await createUserWithEmailAndPassword(auth, `${studentId}@${emailSuffix}`, password);
                  await setDoc(doc(db, "User", studentId), { 
                    name, studentNo: studentId, role: finalRole,
                    cancelCount: 0, penaltyCount: 0, totalUsageCount: 0, totalUsageTime: 0
                  });
                  
                  setIsSignUpMode(false);
                  setSignupType('SELECT');
                  setPasswordConfirm(''); 
                  alert("✅ 가입이 완료되었습니다!\n이제 로그인할 수 있습니다.");
                } catch(e) { 
                  if(e.code === 'auth/email-already-in-use') alert("❌ 이미 가입된 학번/연락처입니다.");
                  else alert("❌ 가입 에러: " + e.message);
                }
              }} style={{ width: '100%', padding: '18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem', marginTop: '10px' }}>
                가입 완료
              </button>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', padding: '0 10px' }}>
                <p onClick={() => setSignupType('SELECT')} style={{ color: '#2563eb', cursor: 'pointer', fontWeight: '900', fontSize: '0.95rem', margin: 0 }}>⬅ 뒤로 가기</p>
                <p onClick={() => { setIsSignUpMode(false); setSignupType('SELECT'); }} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', fontSize: '0.95rem', margin: 0 }}>이미 계정이 있으신가요? 로그인</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. 비밀번호 찾기 (기존의 안전한 코드 복구)
  if (isForgotPasswordMode) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', textAlign: 'center', width: '380px', boxSizing: 'border-box' }}>
          <h1 style={{ color: '#0f172a', marginBottom: '25px', fontWeight: '900' }}>비밀번호 찾기</h1>
          {resetStep === 1 && (
            <>
              <input type="text" placeholder="가입한 학번 입력" onChange={e => setResetStudentId(e.target.value)}
                style={{ width: '100%', padding: '16px', marginBottom: '25px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
              <button onClick={async () => {
                if (!resetStudentId) return alert("학번을 입력해주세요.");
                try {
                  const userSnap = await getDoc(doc(db, "User", resetStudentId));
                  if (userSnap.exists()) {
                    setResetStep(2); 
                  } else {
                    alert("❌ 데이터베이스에 등록되지 않은 학번입니다.");
                  }
                } catch(e) { alert("조회 중 에러가 발생했습니다."); }
              }} style={{ width: '100%', padding: '18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem' }}>학번 확인</button>
            </>
          )}
          {resetStep === 2 && (
            <>
              <input type="password" placeholder="새 비밀번호 입력" onChange={e => setResetPassword(e.target.value)}
                style={{ width: '100%', padding: '16px', marginBottom: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
              <input type="password" placeholder="새 비밀번호 다시 확인" onChange={e => setConfirmResetPassword(e.target.value)}
                style={{ width: '100%', padding: '16px', marginBottom: '25px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
              <button onClick={() => {
                if (resetPassword !== confirmResetPassword) return alert("❌ 비밀번호가 서로 일치하지 않습니다.");
                if (resetPassword.length < 6) return alert("❌ 비밀번호는 6자리 이상이어야 합니다.");
                alert("⚠️ 파이어베이스(Firebase) 보안 정책 안내:\n\n로그인하지 않은 상태에서 클라이언트 코드만으로 비밀번호를 강제 변경하는 것은 보안상 차단되어 있습니다.\n\n불편하시더라도 관리자에게 초기화를 요청해주세요.");
                setIsForgotPasswordMode(false);
                setResetStep(1);
              }} style={{ width: '100%', padding: '18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem' }}>비밀번호 갱신</button>
            </>
          )}
          <p onClick={() => { setIsForgotPasswordMode(false); setResetStep(1); }} style={{ marginTop: '20px', color: '#64748b', cursor: 'pointer', fontWeight: '900' }}>로그인으로 돌아가기</p>
        </div>
      </div>
    );
  }

  return null;
};

export default Auth;