import React, { useState } from 'react';
import { auth, db } from '../firebase'; 
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore'; 

const Auth = ({ isExamPeriod }) => {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState(''); 
  const [name, setName] = useState('');
  
  // 실제 이메일 입력 상태
  const [realEmail, setRealEmail] = useState('');
  
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  
  const [resetStudentId, setResetStudentId] = useState('');
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
              try {
                // 1. 학번을 통해 DB에서 실제 이메일 조회
                const userDoc = await getDoc(doc(db, "User", studentId));
                if (!userDoc.exists()) {
                  return alert("❌ 등록되지 않은 학번입니다.");
                }
                const userData = userDoc.data();
                
                // 과거 가입자는 가짜 이메일, 신규 가입자는 진짜 이메일로 로그인 시도
                const loginEmail = userData.email || (userData.role === 'GUEST' ? `${studentId}@guest.com` : `${studentId}@test.com`);

                const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
                
                // 2. 신규 가입자(진짜 이메일 보유자)인데 이메일 인증을 안 했다면 접근 차단
                if (userData.email && !userCredential.user.emailVerified) {
                  await signOut(auth); // 강제 로그아웃
                  return alert("🚨 이메일 본인 인증이 완료되지 않았습니다.\n\n가입 시 입력하신 이메일의 수신함을 확인하여 인증 링크를 클릭한 후 다시 로그인해주세요.");
                }
              } catch (error) {
                alert("❌ 학번 또는 비밀번호가 틀립니다.");
              }
            }} 
            style={{ margin: 0, padding: 0 }}
          >
            <input type="text" placeholder="학번 입력" onChange={e => setStudentId(e.target.value)} 
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

  // 2. 회원가입 화면 (UI 순서 재배치 완료)
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
              
              {/* 1. 이메일 입력 (가장 위) */}
              <input type="email" placeholder="실제 사용하는 이메일 입력" onChange={e => setRealEmail(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: '2px solid #2563eb', backgroundColor: '#fff', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#0f172a' }} />
              
              <div style={{ textAlign: 'left', marginBottom: '5px', paddingLeft: '5px' }}>
                <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '800' }}>* 가입 완료 시 해당 이메일로 본인 인증 링크가 발송됩니다.</span>
              </div>

              {/* 2. 이름 입력 */}
              <input type="text" placeholder="이름 입력" onChange={e => setName(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              {/* 3. 학번/연락처 입력 */}
              <input type="text" placeholder={signupType === 'STUDENT' ? "학번 입력" : "연락처 (숫자만)"} onChange={e => setStudentId(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              {/* 4. 비밀번호 설정 */}
              <input type="password" placeholder="비밀번호 설정 (6자 이상)" onChange={e => setPassword(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              {/* 5. 비밀번호 확인 */}
              <input type="password" placeholder="비밀번호 확인" onChange={e => setPasswordConfirm(e.target.value)} 
                style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff' }} />
              
              {/* 6. 최종 가입 완료 버튼 */}
              <button onClick={async () => {
                if (!realEmail || !realEmail.includes('@')) return alert("❌ 올바른 이메일 형식을 입력해주세요.");
                if (!name) return alert("❌ 이름을 입력해주세요.");
                if (!studentId) return alert("❌ 학번(연락처)을 입력해주세요.");
                if (password !== passwordConfirm) return alert("❌ 비밀번호가 일치하지 않습니다.");
                if (password.length < 6) return alert("❌ 비밀번호는 6자 이상이어야 합니다.");

                try {
                  const finalRole = signupType === 'GUEST' ? 'GUEST' : (ADMIN_IDS.includes(studentId) ? 'MANAGER' : 'CLIENT');
                  
                  // 1. 계정 생성
                  const userCredential = await createUserWithEmailAndPassword(auth, realEmail, password);
                  
                  // 2. 생성 즉시 이메일로 인증 링크 발송
                  await sendEmailVerification(userCredential.user);

                  // 3. DB 정보 저장
                  await setDoc(doc(db, "User", studentId), { 
                    name, studentNo: studentId, role: finalRole, email: realEmail,
                    cancelCount: 0, penaltyCount: 0, totalUsageCount: 0, totalUsageTime: 0
                  });
                  
                  // 4. 인증 전 로그인을 막기 위해 강제 로그아웃 처리
                  await signOut(auth);

                  setIsSignUpMode(false);
                  setSignupType('SELECT');
                  setPasswordConfirm(''); 
                  setRealEmail('');
                  
                  alert(`✅ 가입 완료!\n\n입력하신 이메일 [${realEmail}]로 본인 인증 메일이 발송되었습니다.\n이메일 본문의 링크를 클릭하여 인증을 완료하신 후 로그인해주세요.`);
                } catch(e) { 
                  if(e.code === 'auth/email-already-in-use') alert("❌ 이미 가입된 이메일입니다.");
                  else alert("❌ 오류 발생: " + e.message); 
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

  // 3. 비밀번호 찾기 화면
  if (isForgotPasswordMode) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', textAlign: 'center', width: '380px', boxSizing: 'border-box' }}>
          <h1 style={{ color: '#0f172a', marginBottom: '20px', fontWeight: '900', fontSize: '1.8rem' }}>비밀번호 찾기</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '30px', lineHeight: '1.5', fontWeight: '700', wordBreak: 'keep-all' }}>
            가입하신 학번을 입력하시면<br/>등록된 이메일로 재설정 링크를 보내드립니다.
          </p>
          
          <input type="text" placeholder="가입한 학번 입력" onChange={e => setResetStudentId(e.target.value)}
            style={{ width: '100%', padding: '18px', marginBottom: '25px', borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
          
          <button onClick={async () => {
            if (!resetStudentId) return alert("학번을 입력해주세요.");
            try {
              const userSnap = await getDoc(doc(db, "User", resetStudentId));
              if (!userSnap.exists()) {
                return alert("❌ 데이터베이스에 등록되지 않은 학번입니다.");
              }
              
              const userData = userSnap.data();
              const targetEmail = userData.email || (userData.role === 'GUEST' ? `${resetStudentId}@guest.com` : `${resetStudentId}@test.com`);

              await sendPasswordResetEmail(auth, targetEmail);
              
              if (userData.email) {
                alert(`✅ [${targetEmail}]\n위 주소로 비밀번호 재설정 이메일을 발송했습니다.\n\n이메일 확인 후 새 비밀번호로 로그인해주세요.`);
              } else {
                alert(`⚠️ 과거 가짜 이메일(@test.com 등)로 가입된 계정입니다.\n시스템이 재설정 링크를 전송했으나 실제 메일로 받아볼 수 없습니다.\n관리자에게 문의하여 이메일을 최신화해주세요.`);
              }
              
              setIsForgotPasswordMode(false);
              setResetStudentId('');
            } catch (error) {
              console.error("이메일 발송 에러:", error);
              alert(`❌ 이메일 발송에 실패했습니다.\n${error.message}`);
            }
          }} style={{ width: '100%', padding: '20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem', transition: '0.2s' }}>
            재설정 이메일 발송
          </button>
          
          <div style={{ marginTop: '25px' }}>
            <p onClick={() => setIsForgotPasswordMode(false)} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', margin: 0 }}>로그인으로 돌아가기</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Auth;