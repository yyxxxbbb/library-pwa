import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자'];
const VALID_ACTIONS = ['RETURN', 'AUTO_CHECKOUT'];

const maskName = (name) => {
  if (!name) return '익명';
  if (name.length <= 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
};

export default function RankingPage({ onBack, period = "ALL", user }) {
  const [ranking, setRanking] = useState([]);
  const [myRecord, setMyRecord] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(period); 

  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "Log"));
        const logs = snap.docs.map(d => d.data()).filter(l => VALID_ACTIONS.includes(l.action));
        
        const now = new Date();
        let cutoff = null;
        if (filter === "WEEK") { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); }
        else if (filter === "MONTH") { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1); }

        const totals = {};
        logs.forEach(l => {
          const id = (l.uid || l.studentNo || '').split('@')[0];
          if (!id || ADMIN_IDS.includes(id)) return;
          
          const ts = l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000) : (l.createdAt?.toDate ? l.createdAt.toDate() : null);
          if (cutoff && ts && ts < cutoff) return;
          
          totals[id] = (totals[id] || 0) + (l.usedMinutes || 0);
        });

        const sortedAll = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const top10 = sortedAll.slice(0, 10);

        // 🆕 내 기록 계산 및 Firebase에서 '내 이름' 가져오기
        const myId = user?.email?.split('@')[0];
        let myMins = 0;
        let myRnk = '-';
        let myName = '익명'; // 💡 내 이름 저장할 변수

        if (myId && !ADMIN_IDS.includes(myId)) {
          myMins = totals[myId] || 0;
          const idx = sortedAll.findIndex(([id]) => id === myId);
          myRnk = idx !== -1 ? idx + 1 : '-';

          // 💡 내 ID로 User 컬렉션에서 진짜 이름 찾아오기
          try {
            const myUserDoc = await getDoc(doc(db, "User", myId));
            if (myUserDoc.exists() && myUserDoc.data().name) {
              myName = myUserDoc.data().name;
            }
          } catch (e) { console.error("내 이름 로드 실패:", e); }
        }

        const withNames = await Promise.all(top10.map(async ([id, mins]) => {
          let name = '익명';
          try {
            const u = await getDoc(doc(db, "User", id));
            if (u.exists()) name = u.data().name || '익명';
          } catch (e) { console.error(e); }
          return { id, name, mins };
        }));

        if (isMounted) {
          setRanking(withNames);
          // 💡 내 기록 상태에 이름(myName)도 함께 저장
          setMyRecord({ id: myId, mins: myMins, rank: myRnk, name: myName }); 
        }
      } catch (e) {
        console.error("랭킹 로드 실패:", e);
      } finally { 
        if (isMounted) setLoading(false); 
      }
    })();

    return () => { isMounted = false; };
  }, [filter, user]);

  const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;

  return (
    <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #f59e0b", paddingLeft: "15px", fontSize: "1.4rem" }}>
          🏆 도서관 이용자 순위 
        </h2>
        <button onClick={onBack} style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "8px 14px", fontWeight: 900, cursor: "pointer", color: "#475569" }}>
          ← 뒤로
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {[["ALL", "전체"], ["MONTH", "최근 한 달"], ["WEEK", "최근 일주일"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding: "8px 16px", borderRadius: "10px", border: "none", fontWeight: 900, cursor: "pointer",
              background: filter === k ? "#f59e0b" : "#f1f5f9", color: filter === k ? "#fff" : "#475569" }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "40px 0" }}>랭킹 집계 중...</p>
      ) : (
        <>
          {ranking.length === 0 ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "40px 0" }}>아직 집계된 이용 기록이 없습니다.</p>
          ) : (
            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              {ranking.map((r, i) => {
                const h = Math.floor(r.mins / 60);
                const m = r.mins % 60;
                const isTop3 = i < 3;
                return (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: "15px", padding: "18px 20px",
                    background: isTop3 ? "linear-gradient(135deg, #fef3c7, #fde68a)" : "#f8fafc",
                    borderRadius: "16px", border: `2px solid ${isTop3 ? "#f59e0b" : "#e2e8f0"}`
                  }}>
                    <div style={{ fontSize: isTop3 ? "1.8rem" : "1.2rem", fontWeight: 900, minWidth: "40px", textAlign: "center", color: isTop3 ? "#92400e" : "#64748b" }}>
                      {medal(i)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, color: "#0f172a", fontSize: "1.05rem" }}>{maskName(r.name)}</div>
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>{r.id.substring(0, 4)}****</div>
                    </div>
                    <div style={{
                      background: isTop3 ? "#fff" : "#eff6ff",
                      color: isTop3 ? "#92400e" : "#2563eb",
                      padding: "8px 16px", borderRadius: "20px", fontWeight: 900, fontSize: "0.95rem"
                    }}>
                      {h > 0 && `${h}시간 `}{m}분
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {myRecord && myRecord.id && !ADMIN_IDS.includes(myRecord.id) && (
            <div style={{ marginTop: "30px", paddingTop: "25px", borderTop: "2px dashed #cbd5e1" }}>
              <h3 style={{ margin: "0 0 15px 0", fontSize: "1.05rem", fontWeight: 900, color: "#475569" }}>
                👤 내 이용 기록
              </h3>
              <div style={{
                display: "flex", alignItems: "center", gap: "15px", padding: "18px 20px",
                background: "#eff6ff", 
                borderRadius: "16px", border: "2px solid #bfdbfe"
              }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 900, minWidth: "40px", textAlign: "center", color: "#2563eb" }}>
                  {myRecord.rank !== '-' ? `${myRecord.rank}위` : '-'}
                </div>
                <div style={{ flex: 1 }}>
                  {/* 💡 이 부분에 사용자의 실제 이름과 (나) 표시를 추가했습니다 */}
                  <div style={{ fontWeight: 900, color: "#1e3a8a", fontSize: "1.05rem" }}>
                    {myRecord.name} <span style={{ fontSize: "0.85rem", color: "#3b82f6", fontWeight: 800 }}>(나)</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#60a5fa", fontWeight: 700 }}>{myRecord.id}</div>
                </div>
                <div style={{
                  background: "#fff",
                  color: "#2563eb",
                  border: "1px solid #bfdbfe",
                  padding: "8px 16px", borderRadius: "20px", fontWeight: 900, fontSize: "0.95rem"
                }}>
                  {Math.floor(myRecord.mins / 60) > 0 && `${Math.floor(myRecord.mins / 60)}시간 `}{myRecord.mins % 60}분
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}