import React, { useEffect, useState } from "react";
import { fetchAllEvents } from "../api/eventApi";
import { fetchActiveNotices } from "../api/noticeApi"; // 🆕 공지사항 API

// 👤 사용자용 공지사항 및 이벤트 통합 게시판 (모든 로그인 사용자 접근 가능)

// 💡 [수정 1] initialTab을 props로 받습니다. 기본값은 "NOTICE"로 둡니다.
export default function EventBoard({ initialTab = "NOTICE", onBack, onSelectEvent, onSelectNotice }) {
  // 💡 [수정 2] 무조건 "NOTICE"로 시작하던 것을 initialTab 값으로 시작하게 바꿉니다.
  const [mainTab, setMainTab] = useState(initialTab); 

  // 💡 [수정 3] App.jsx에서 탭이 바뀌어서 들어올 때 즉시 탭을 바꿔줍니다.
  useEffect(() => {
    if (initialTab) {
      setMainTab(initialTab);
    }
  }, [initialTab]);

  // --------------------------------------------------------------------
  // ✨ [장혁님 기존 코드 완벽 유지 구간] 이벤트 관련 상태 및 로직
  // --------------------------------------------------------------------
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  // 🆕 공지사항 데이터 저장용 상태만 조용히 하나 추가
  const [noticeList, setNoticeList] = useState([]);

  useEffect(() => {
    // 💡 1. 기존 이벤트 로드 (장혁님 코드 그대로! 절대 건드리지 않음)
    fetchAllEvents()
      .then((data) => { setList(data || []); setLoading(false); })
      .catch((err) => { console.error("이벤트 로드 실패:", err); setLoading(false); });

    // 💡 2. 공지사항 로드 (이벤트 코드에 영향을 주지 않도록 독립적으로 실행)
    fetchActiveNotices()
      .then((data) => { setNoticeList(data || []); })
      .catch((err) => { console.error("공지사항 로드 실패:", err); setNoticeList([]); });
  }, []);

  // 오늘 날짜 구하기 (YYYY-MM-DD 형식)
  const todayStr = new Date().toISOString().split("T")[0];

  // 💡 종료 날짜(endDate)까지 고려해서 훨씬 똑똑해진 상태 판별 함수
  const getEventStatus = (e) => {
    if (!e.isActive) return "ENDED"; // 관리자가 직접 스위치를 끈 경우 (조기 종료/숨김)
    if (e.endDate && e.endDate < todayStr) return "ENDED"; // 기간이 끝난 경우 (자동 종료)
    if (e.startDate && e.startDate > todayStr) return "UPCOMING"; // 아직 시작 전인 경우 (진행 예정)
    return "ACTIVE"; // 그 외 (현재 기간 내 + 스위치 켜짐 = 진행 중)
  };

  // 🆕 필터 조건 (로직이 훨씬 깔끔해졌습니다)
  const view = list.filter((e) => {
    if (filter === "ALL") return true;
    return getEventStatus(e) === filter; 
  });
  // --------------------------------------------------------------------

  return (
    <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
      {/* 타이틀을 '이벤트 게시판'에서 '공지사항 및 이벤트'로 변경 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #2563eb", paddingLeft: "15px", fontSize: "1.4rem" }}>
          📢 공지사항 및 이벤트
        </h2>
        <button
          onClick={onBack}
          style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "8px 14px", fontWeight: 900, cursor: "pointer", color: "#475569" }}
        >
          ← 뒤로
        </button>
      </div>

      {/* ====================================================================
          💡 [새로 추가된 구역] 메인 탭 선택 (공지사항 / 이벤트)
          ==================================================================== */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "25px", borderBottom: "2px solid #f1f5f9" }}>
        <button
          onClick={() => setMainTab("NOTICE")}
          style={{
            padding: "10px 5px", background: "transparent", border: "none", fontWeight: 900, fontSize: "1.1rem", cursor: "pointer",
            color: mainTab === "NOTICE" ? "#2563eb" : "#94a3b8",
            borderBottom: mainTab === "NOTICE" ? "3px solid #2563eb" : "3px solid transparent", marginBottom: "-2px", transition: "0.2s"
          }}
        >
          공지사항
        </button>
        <button
          onClick={() => setMainTab("EVENT")}
          style={{
            padding: "10px 5px", background: "transparent", border: "none", fontWeight: 900, fontSize: "1.1rem", cursor: "pointer",
            color: mainTab === "EVENT" ? "#2563eb" : "#94a3b8",
            borderBottom: mainTab === "EVENT" ? "3px solid #2563eb" : "3px solid transparent", marginBottom: "-2px", transition: "0.2s"
          }}
        >
          이벤트
        </button>
      </div>

      {/* 탭 내용에 따른 분기 */}
      {mainTab === "NOTICE" ? (

        /* ====================================================================
           📝 공지사항 리스트 화면
           ==================================================================== */
        noticeList.length === 0 ? (
          <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "40px 0" }}>등록된 공지사항이 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {noticeList.map(notice => (
              <div 
                key={notice.id} 
                onClick={() => onSelectNotice && onSelectNotice(notice)}
                style={{ padding: "20px", background: "#f8fafc", borderRadius: "16px", border: "2px solid #e2e8f0", cursor: "pointer", transition: "0.2s" }}
                onMouseOver={(ev) => ev.currentTarget.style.borderColor = "#2563eb"}
                onMouseOut={(ev) => ev.currentTarget.style.borderColor = "#e2e8f0"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ background: "#eff6ff", color: "#2563eb", padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 900 }}>공지</span>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>
                    {notice.createdAt ? new Date(notice.createdAt).toLocaleDateString('ko-KR') : ""}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, color: "#0f172a" }}>{notice.title}</h3>
              </div>
            ))}
          </div>
        )
      ) : (

        /* ====================================================================
           🎉 이벤트 화면 (장혁님이 주신 코드 토시 하나 안 틀리고 그대로 복붙!)
           ==================================================================== */
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            {/* 🆕 "종료" 탭이 추가되었습니다! */}
            {[
              ["ALL", "전체"], 
              ["ACTIVE", "진행 중"], 
              ["UPCOMING", "진행 예정"], 
              ["ENDED", "종료"]
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  fontWeight: 900,
                  cursor: "pointer",
                  transition: "0.2s",
                  background: filter === k ? "#2563eb" : "#f1f5f9",
                  color: filter === k ? "#fff" : "#475569",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "40px 0" }}>
              이벤트를 불러오는 중...
            </p>
          ) : view.length === 0 ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "40px 0" }}>
              해당되는 이벤트가 없습니다.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {view.map((e) => {
                const status = getEventStatus(e);
                let badgeBg = "#f1f5f9";    // 기본 배경 (종료)
                let badgeColor = "#64748b"; // 기본 글자색 (종료)
                let badgeText = "종료";     // 기본 텍스트

                if (status === "ACTIVE") {
                  badgeBg = "#dcfce7"; badgeColor = "#16a34a"; badgeText = "진행 중";
                } else if (status === "UPCOMING") {
                  badgeBg = "#fef08a"; badgeColor = "#ca8a04"; badgeText = "진행 예정";
                }

                return (
                  <div
                    key={e.id}
                    onClick={() => onSelectEvent(e)}
                    style={{
                      background: "#f8fafc",
                      border: "2px solid #e2e8f0",
                      borderRadius: "16px",
                      overflow: "hidden",
                      cursor: "pointer",
                      transition: "0.2s",
                      opacity: status === "ENDED" ? 0.6 : 1, // 🆕 종료된 이벤트는 약간 투명하게 처리해서 구분
                    }}
                    onMouseOver={(ev) => {
                      ev.currentTarget.style.borderColor = "#2563eb";
                      ev.currentTarget.style.opacity = 1; // 마우스 올리면 다시 또렷하게
                    }}
                    onMouseOut={(ev) => {
                      ev.currentTarget.style.borderColor = "#e2e8f0";
                      ev.currentTarget.style.opacity = status === "ENDED" ? 0.6 : 1; 
                    }}
                  >
                    <div style={{ aspectRatio: "16 / 9", background: "#e2e8f0" }}>
                      {e.imageUrl && (
                        <img src={e.imageUrl} alt={e.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </div>
                    <div style={{ padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span
                          style={{
                            background: badgeBg,
                            color: badgeColor,
                            padding: "4px 10px",
                            borderRadius: "8px",
                            fontSize: "0.75rem",
                            fontWeight: 900,
                          }}
                        >
                          {badgeText}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700 }}>
                          {e.startDate} {status === "ENDED" && "~ 종료됨"}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f172a" }}>{e.title}</h3>
                      <p
                        style={{
                          margin: "14px 0 0 0", // ✨ 이 부분 간격을 늘려서 제목과 내용 사이를 여유롭게 띄웠습니다! (기존 8px -> 14px)
                          color: "#64748b",
                          fontSize: "0.85rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {e.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}