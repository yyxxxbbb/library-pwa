import React from 'react';

const FloorMap = ({ 
  activeFloor, title, seats, user, isAdmin, currentUserData, viewMode, now, 
  setSelectedSeat, setShowCancelWarning 
}) => {
  // 관리자 명단 (App.jsx와 동일하게 유지)
  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자']; 

  const floorSeats = seats.filter(seat => seat.id.startsWith(activeFloor));
  const zones = {};
  floorSeats.forEach(seat => {
    const zoneId = seat.id.substring(0, seat.id.lastIndexOf('-'));
    if (!zones[zoneId]) zones[zoneId] = [];
    zones[zoneId].push(seat);
  });

  return (
    <div style={{ marginBottom: '40px', background: '#fff', padding: '25px 30px', borderRadius: '20px', boxShadow: '0 5px 20px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: '#111', fontSize: '1.6rem', marginBottom: '25px', borderLeft: '6px solid #0056b3', paddingLeft: '15px', fontWeight: '900' }}>{title}</h2>
      
      <div style={{ columnCount: window.innerWidth > 1024 ? 3 : window.innerWidth > 700 ? 2 : 1, columnGap: '20px', width: '100%' }}>
        {Object.keys(zones).map(zoneId => {
          const seatCount = zones[zoneId].length;
          const gridCols = seatCount >= 15 ? 5 : seatCount >= 7 ? 4 : 3;

          return (
            <div key={zoneId} style={{ breakInside: 'avoid', display: 'inline-block', width: '100%', marginBottom: '25px', verticalAlign: 'top' }}>
              <h4 style={{ fontSize: '1.1rem', color: '#333', marginBottom: '15px', fontWeight: '900' }}>
                📍 {zones[zoneId][0].label.replace(/\s\d+$/, '')}
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: '10px' }}>
              {zones[zoneId].map(seat => {
                
                // 1️⃣ 관리자 여부 판단
                const myId = String(user?.studentNo || ""); 
                const myEmailPrefix = user?.email?.split('@')[0] || "";
                const isOwnerAdmin = ADMIN_IDS.some(adminId => 
                  String(adminId) === myId || 
                  String(adminId) === myEmailPrefix ||
                  user?.uid === adminId
                ) || viewMode === 'ADMIN';

                // 2️⃣ 내 자리 확인
                const isMySeat = (user && seat.userId === user.uid) || (user && seat.userId === user.email);

                // 3️⃣ 이름 결정
                let seatOwnerName = seat.userName || seat.userId?.split('@')[0] || "이름없음";
                if (isMySeat && currentUserData?.name) {
                  seatOwnerName = currentUserData.name;
                }
                const displayUserText = ADMIN_IDS.includes(seat.userId?.split('@')[0]) ? '관리자' : seatOwnerName;

                // 4️⃣ 시간 만료 체크
                let isExpired = false;
                if (seat.status === 'OCCUPIED' && seat.startedAt && seat.reservedHours) {
                  const st = seat.startedAt.toDate ? seat.startedAt.toDate() : new Date(seat.startedAt);
                  isExpired = (now - st) >= (seat.reservedHours * 60 * 60 * 1000);
                }

                // 🚨 5️⃣ 상태별 색상 및 스타일 결정
                let bgColor = '#fff'; let borderColor = '#94a3b8'; let textColor = '#0f172a';
                let opacity = 1;
                let cursorStyle = 'pointer';

                if (seat.status === 'DISABLED') {
                  bgColor = '#e2e8f0'; 
                  borderColor = '#94a3b8';
                  textColor = '#64748b';
                  opacity = 0.7;
                  cursorStyle = isAdmin ? 'pointer' : 'not-allowed'; 
                } 
                else if (seat.status === 'RESERVED') { 
                  bgColor = '#fef08a'; borderColor = '#ca8a04'; textColor = '#713f12'; 
                }
                else if (seat.status === 'OCCUPIED') {
                  if (isMySeat || isAdmin) {
                    if (isExpired) { bgColor = '#f3e8ff'; borderColor = '#9333ea'; textColor = '#6b21a8'; }
                    else { bgColor = '#bbf7d0'; borderColor = '#16a34a'; textColor = '#14532d'; }
                  } else { 
                    bgColor = '#fecaca'; borderColor = '#b91c1c'; textColor = '#7f1d1d'; 
                  }
                }

                return (
                  <div key={seat.id} 
                    onClick={() => { 
                      setSelectedSeat(seat);
                    }}
                    style={{ 
                      height: '75px', padding: '8px 4px', boxSizing: 'border-box', background: bgColor, borderRadius: '12px', 
                      border: `3px solid ${isMySeat ? '#2563eb' : borderColor}`,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
                      cursor: cursorStyle, transition: '0.2s', textAlign: 'center', opacity: opacity,
                      boxShadow: isMySeat ? '0 0 12px rgba(37, 99, 235, 0.5)' : 'none', position: 'relative'
                    }}>
                    {/* 좌석 번호 */}
                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: textColor }}>
                      {seat.status === 'DISABLED' ? '🚫' : (seat.label.includes('스터디룸2') ? '1' : seat.id.split('-').pop())}
                    </span>
                    
                    {/* 상태 텍스트 */}
                    {(seat.status === 'OCCUPIED' || seat.status === 'RESERVED') && (
                      <div style={{ fontSize: '0.75rem', color: textColor, fontWeight: '900', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '90%' }}>
                        {(isAdmin || isMySeat) ? displayUserText : (seat.status === 'OCCUPIED' ? '사용중' : '예약중')}
                      </div>
                    )}

                    {/* 비활성 점검 중 */}
                    {seat.status === 'DISABLED' && (
                      <div style={{ fontSize: '0.7rem', color: textColor, fontWeight: '900', marginTop: '2px' }}>점검 중</div>
                    )}

                    {/* 초과 알림 */}
                    {isExpired && (isAdmin || isMySeat) && (
                      <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.65rem', color: '#dc2626', fontWeight: '900', background: '#fee2e2', padding: '1px 6px', borderRadius: '8px', border: '1px solid #fca5a5', whiteSpace: 'nowrap', zIndex: 10 }}>🚨 초과</div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FloorMap;