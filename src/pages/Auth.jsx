import React, { useState } from 'react';
import { auth, db } from '../firebase'; 
// 🚨 updateProfile이 추가되었습니다.
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut, updatePassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'; 

const Auth = ({ isExamPeriod }) => {
  const [loginId, setLoginId] = useState(''); 
  
  const [realEmail, setRealEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState(''); 
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  
  // 가입 스텝: 1(이메일만) -> 2(인증대기) -> 3(비번 및 상세정보 입력)
  const [signUpStep, setSignUpStep] = useState(1);
  const [signupType, setSignupType] = useState('SELECT');
  
  const [resetStudentId, setResetStudentId] = useState('');

  const TEMP_PASS = "Temp!@#123"; // 메일 발송용 임시 비밀번호

  const inputStyle = { width: '100%', padding: '16px', borderRadius: '10px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1rem', fontWeight: '900', color: '#fff', marginBottom: '12px' };
  const buttonStyle = { width: '100%', padding: '18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem', marginTop: '5px', transition: '0.2s' };

  // 가입 취소 시 쓰레기 데이터(임시 계정) 완전 삭제
  const handleCancelRegistration = async () => {
    if (signUpStep > 1 && auth.currentUser) {
      try { await auth.currentUser.delete(); } catch(e) {}
    }
    setIsSignUpMode(false);
    setSignupType('SELECT');
    setSignUpStep(1);
    setRealEmail('');
    setStudentId('');
    setPassword('');
    setPasswordConfirm('');
    setName('');
  };

  // ==========================================
  // 1. 로그인 화면
  // ==========================================
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
              if (!loginId || !password) return alert("아이디와 비밀번호를 입력해주세요.");
              try {
                const emailToLogin = loginId.includes('@') ? loginId : `${loginId}@test.com`;
                const cred = await signInWithEmailAndPassword(auth, emailToLogin, password);

                if (!emailToLogin.includes('@test.com') && !cred.user.emailVerified) {
                  await signOut(auth); 
                  return alert("🚨 이메일 인증이 완료되지 않았습니다.\n가입하신 이메일의 편지함에서 인증 링크를 클릭한 후 로그인해주세요.");
                }
              } catch (err) {
                alert("❌ 로그인 실패: 아이디 또는 비밀번호가 틀립니다.");
              }
            }} 
            style={{ margin: 0, padding: 0 }}
          >
            <input type="text" placeholder="이메일" onChange={e => setLoginId(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="비밀번호" onChange={e => setPassword(e.target.value)} style={{...inputStyle, marginBottom: '30px'}} />
            <button type="submit" style={buttonStyle}>로그인</button>
          </form>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
            <p onClick={() => { setIsSignUpMode(true); setPassword(''); setSignUpStep(1); }} style={{ color: '#2563eb', cursor: 'pointer', fontWeight: '900', margin: 0 }}>회원가입</p>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <p onClick={() => setIsForgotPasswordMode(true)} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', margin: 0 }}>비밀번호 찾기</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. 회원가입 화면
  // ==========================================
  if (isSignUpMode) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: '100vw', background: 'transparent', zIndex: 9999 }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', textAlign: 'center', width: '400px' }}>
          
          <h1 style={{ color: '#0f172a', marginBottom: '30px', fontWeight: '900', fontSize: '1.8rem' }}>
            {signupType === 'SELECT' ? '가입 유형 선택' : signupType === 'STUDENT' ? '🎓 학생 회원가입' : '👤 외부인 회원가입'}
          </h1>

          {signupType === 'SELECT' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', marginBottom: '35px' }}>
                <button onClick={() => setSignupType('STUDENT')} style={{ flex: 1, padding: '40px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s' }}>학생입니다</button>
                <button onClick={() => setSignupType('GUEST')} style={{ flex: 1, padding: '40px 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s' }}>외부인입니다</button>
              </div>
              <p onClick={() => setIsSignUpMode(false)} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', margin: 0 }}>취소</p>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              
              {/* [STEP 1]: 정말로 '이메일'만 입력받습니다. */}
              {signUpStep === 1 && (
                <>
                  <input type="email" placeholder="사용할 이메일 (예: test@naver.com)" onChange={e => setRealEmail(e.target.value)} 
                    style={{ ...inputStyle, border: '2px solid #2563eb', backgroundColor: '#fff', color: '#0f172a' }} />
                  
                  <p style={{ margin: '0 0 15px 5px', fontSize: '0.8rem', color: '#dc2626', fontWeight: '800', textAlign: 'left' }}>
                    * 입력하신 이메일로 인증 링크가 발송됩니다.
                  </p>

                  <button onClick={async () => {
                    if (!realEmail || !realEmail.includes('@')) return alert("❌ 올바른 이메일 형식을 입력해주세요.");

                    try {
                      const cred = await createUserWithEmailAndPassword(auth, realEmail, TEMP_PASS);
                      await sendEmailVerification(cred.user);
                      alert("✅ 인증 메일이 발송되었습니다. 메일함에서 링크를 클릭한 후 [인증 완료 확인]을 눌러주세요.");
                      setSignUpStep(2); 
                    } catch(e) {
                      if (e.code === 'auth/email-already-in-use') {
                        try {
                          const cred = await signInWithEmailAndPassword(auth, realEmail, TEMP_PASS);
                          await sendEmailVerification(cred.user); 
                          alert("✅ 인증 메일이 재발송되었습니다.");
                          setSignUpStep(2);
                        } catch(err) {
                          alert("❌ 이미 정식 가입이 완료된 이메일입니다. 로그인 화면으로 돌아가주세요.");
                        }
                      } else {
                        alert("❌ 오류: " + e.message);
                      }
                    }
                  }} style={buttonStyle}>이메일 인증 메일 발송</button>
                </>
              )}

              {/* [STEP 2]: 인증 확인 대기 */}
              {signUpStep === 2 && (
                <>
                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '15px' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1e293b', fontWeight: '900' }}>
                      <span style={{color: '#2563eb'}}>{realEmail}</span>(으)로<br/>인증 메일이 발송되었습니다.
                    </p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#dc2626', fontWeight: '700', lineHeight: '1.4' }}>
                      메일함에서 본인 인증 링크를 클릭하신 후,<br/>반드시 아래의 <b>[인증 완료 확인]</b> 버튼을 눌러주세요.
                    </p>
                  </div>

                  <button onClick={async () => {
                    if (!auth.currentUser) return alert("❌ 세션이 만료되었습니다. 다시 시도해주세요.");
                    await auth.currentUser.reload(); 
                    if (auth.currentUser.emailVerified) {
                      setSignUpStep(3); 
                    } else {
                      alert("🚨 아직 인증되지 않았습니다. 메일함의 링크를 클릭하셨나요?");
                    }
                  }} style={{ ...buttonStyle, background: '#10b981' }}>✅ 인증 완료 확인</button>
                </>
              )}

              {/* [STEP 3]: 정보 입력 및 최종 완료 */}
              {signUpStep === 3 && (
                <>
                  <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '10px', marginBottom: '15px', color: '#16a34a', fontWeight: '900', fontSize: '0.9rem' }}>
                    ✅ 이메일 인증 완료! 나머지 정보를 입력해주세요.
                  </div>

                  <input type="text" placeholder="이름 입력" onChange={e => setName(e.target.value)} style={inputStyle} />
                  <input type="text" placeholder={signupType === 'STUDENT' ? "학번 입력" : "연락처 (숫자만)"} onChange={e => setStudentId(e.target.value)} style={inputStyle} />
                  
                  <input type="password" placeholder="사용할 비밀번호 설정 (6자 이상)" onChange={e => setPassword(e.target.value)} 
                    style={{ ...inputStyle, border: '2px solid #2563eb', backgroundColor: '#fff', color: '#0f172a' }} />
                  <input type="password" placeholder="비밀번호 다시 확인" onChange={e => setPasswordConfirm(e.target.value)} 
                    style={{ ...inputStyle, border: '2px solid #2563eb', backgroundColor: '#fff', color: '#0f172a' }} />

                  <button onClick={async () => {
                    if (!name || !studentId) return alert("이름과 학번을 모두 입력해주세요.");
                    if (password.length < 6) return alert("❌ 비밀번호는 최소 6자리 이상이어야 합니다.");
                    if (password !== passwordConfirm) return alert("❌ 비밀번호가 일치하지 않습니다.");

                    try {
                      // 1. 임시 비밀번호를 진짜 비밀번호로 변경
                      await updatePassword(auth.currentUser, password);
                      
                      // 🚨 [핵심] 파이어베이스 계정 프로필 자체에 사용자가 입력한 '이름'을 저장합니다.
                      await updateProfile(auth.currentUser, { displayName: name });
                      
                      // 3. Firestore 데이터베이스에 최종 정보 저장
                      await setDoc(doc(db, "User", auth.currentUser.uid), { 
                        name, 
                        studentNo: studentId, 
                        email: realEmail, 
                        role: 'CLIENT', 
                        createdAt: serverTimestamp() 
                      });
                      
                      alert("🎉 최종 가입 완료! 설정하신 비밀번호로 로그인해주세요.");
                      
                      // 4. 가입 완료 후 로그아웃하여 로그인 화면으로 깨끗하게 전환
                      await signOut(auth);
                      
                      setIsSignUpMode(false);
                      setSignupType('SELECT');
                      setSignUpStep(1);
                      setRealEmail(''); setPassword(''); setPasswordConfirm(''); setName(''); setStudentId('');
                    } catch(e) { 
                      alert("가입 오류: " + e.message); 
                    }
                  }} style={buttonStyle}>최종 가입 완료</button>
                </>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', padding: '0 5px' }}>
                <p onClick={handleCancelRegistration} style={{ color: '#dc2626', cursor: 'pointer', fontWeight: '900', fontSize: '0.95rem', margin: 0 }}>취소 (처음으로)</p>
                <p onClick={handleCancelRegistration} style={{ color: '#64748b', cursor: 'pointer', fontWeight: '900', fontSize: '0.95rem', margin: 0 }}>로그인 화면으로</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. 비밀번호 찾기 화면 (보안 에러 완벽 해결 버전)
  // ==========================================
  if (isForgotPasswordMode) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '50px 40px', borderRadius: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', textAlign: 'center', width: '380px', boxSizing: 'border-box' }}>
          <h1 style={{ color: '#0f172a', marginBottom: '20px', fontWeight: '900', fontSize: '1.8rem' }}>비밀번호 찾기</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '30px', lineHeight: '1.5', fontWeight: '700', wordBreak: 'keep-all' }}>
            가입 시 등록하신 <b>이메일 주소</b>를 입력하시면<br/>재설정 링크를 보내드립니다.
          </p>
          
          {/* 상태 변수는 기존 resetStudentId를 그대로 재사용하지만, 입력은 이메일을 받습니다 */}
          <input type="email" placeholder="가입한 이메일 입력 (예: test@test.com)" onChange={e => setResetStudentId(e.target.value)}
            style={{ width: '100%', padding: '18px', marginBottom: '25px', borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', boxSizing: 'border-box', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }} />
          
          <button onClick={async () => {
            if (!resetStudentId || !resetStudentId.includes('@')) return alert("올바른 이메일 주소를 입력해주세요.");
            try {
              // 1. 핵심: 이동할 주소와 앱 내 처리 설정을 명시합니다.
              const actionCodeSettings = {
                url: 'https://library-pwa-psi.vercel.app/reset-password', // 배포하신 실제 도메인 경로
                handleCodeInApp: true, // 파이어베이스가 링크 클릭 시 우리 앱으로 바로 보내도록 설정
              };

              // 2. 두 번째 인자로 actionCodeSettings를 전달합니다.
              await sendPasswordResetEmail(auth, resetStudentId, actionCodeSettings);
              
              alert(`✅ [${resetStudentId}]\n위 주소로 비밀번호 재설정 이메일을 발송했습니다.\n\n메일함에서 링크를 클릭하시면 비밀번호 변경 화면으로 이동합니다.`);
              setIsForgotPasswordMode(false);
              setResetStudentId('');
            } catch (error) {
              if (error.code === 'auth/user-not-found') {
                alert("❌ 가입되지 않은 이메일입니다.");
              } else {
                alert(`❌ 오류가 발생했습니다.\n${error.message}`);
              }
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