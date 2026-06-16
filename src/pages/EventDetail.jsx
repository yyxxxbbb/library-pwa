import React, { useState } from "react";

// 👤 이벤트/공지사항 상세 페이지 (모든 로그인 사용자 접근 가능)
export default function EventDetail({ event, onBack }) {
  // 클릭한 이미지의 URL을 저장하는 상태 (확대 모달용)
  const [modalImage, setModalImage] = useState(null);

  if (!event) {
    return (
      <div style={{ background: "#fff", padding: "40px", borderRadius: "25px", textAlign: "center", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <p style={{ color: "#94a3b8", fontWeight: 700 }}>정보를 불러올 수 없습니다.</p>
        <button onClick={onBack} style={{ marginTop: "20px", background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 20px", fontWeight: 900, cursor: "pointer" }}>
          ← 목록으로
        </button>
      </div>
    );
  }

  // 💡 공지사항인지 확인하는 변수 (startDate가 없거나 _type이 NOTICE인 경우)
  const isNotice = event._type === "NOTICE" || !event.startDate;

  // ====================================================================
  // 이벤트 상태 계산 로직 (공지사항이 아닐 때만 계산)
  // ====================================================================
  let badgeBg = "#f1f5f9";    
  let badgeColor = "#64748b";
  let badgeText = "종료";

  if (!isNotice) {
    const todayStr = new Date().toISOString().split("T")[0];
    const getEventStatus = (e) => {
      if (!e.isActive) return "ENDED"; 
      if (e.endDate && e.endDate < todayStr) return "ENDED"; 
      if (e.startDate && e.startDate > todayStr) return "UPCOMING"; 
      return "ACTIVE"; 
    };

    const status = getEventStatus(event);
    if (status === "ACTIVE") {
      badgeBg = "#dcfce7"; badgeColor = "#16a34a"; badgeText = "진행 중";
    } else if (status === "UPCOMING") {
      badgeBg = "#fef08a"; badgeColor = "#ca8a04"; badgeText = "진행 예정";
    }
  }
  // ====================================================================

  return (
    <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button
          onClick={onBack}
          style={{
            background: "#f1f5f9",
            border: "none",
            borderRadius: "10px",
            padding: "8px 14px",
            fontWeight: 900,
            cursor: "pointer",
            color: "#475569",
          }}
        >
          ← 목록
        </button>
      </div>

      {/* 🖼️ 1. 메인 배너 이미지 */}
      {event.imageUrl && (
        <div
          onClick={() => setModalImage(event.imageUrl)}
          style={{
            borderRadius: "16px",
            overflow: "hidden",
            marginBottom: "20px",
            background: "#f8fafc",
            cursor: "zoom-in",
            textAlign: "center",
            border: "1px solid #e2e8f0"
          }}
        >
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{ 
              width: "100%", 
              height: "auto", 
              maxHeight: "500px", 
              objectFit: "contain",
              display: "block",
              margin: "0 auto"
            }}
          />
          <div style={{ padding: "10px", background: "#f1f5f9", color: "#64748b", fontSize: "0.85rem", fontWeight: "800" }}>
            🔍 이미지를 클릭하면 크게 볼 수 있습니다
          </div>
        </div>
      )}

      {/* 💡 [수정] 공지사항이 아닐 때만 뱃지(진행 중, 종료 등)를 렌더링! */}
      {!isNotice && (
        <span
          style={{
            background: badgeBg,
            color: badgeColor,
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "0.8rem",
            fontWeight: 900,
          }}
        >
          {badgeText}
        </span>
      )}

      {/* 제목 및 날짜 간격 설정 */}
      <h1 style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0f172a", margin: "12px 0 20px" }}>
        {event.title}
      </h1>
      
      {/* 💡 [수정] 공지사항일 경우 작성일만 표시, 이벤트일 경우 시작~종료일 표시 */}
      <p style={{ color: "#64748b", fontWeight: 700, marginBottom: "20px" }}>
        {isNotice 
          ? `작성일 : ${event.createdAt ? new Date(event.createdAt).toLocaleDateString('ko-KR') : ''}` 
          : `${event.startDate} ~ ${event.endDate}`}
      </p>

      {/* 📝 본문 내용 텍스트 */}
      <div
        style={{
          background: "#f8fafc",
          padding: "20px",
          borderRadius: "16px",
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
          color: "#1e293b",
          fontWeight: 600,
          border: "1px solid #e2e8f0",
        }}
      >
        {event.content}
      </div>

      {/* ====================================================================
          🖼️ 2. 본문 추가 이미지 - 원본 비율 보존 및 스마트 스크롤 영역
          ==================================================================== */}
      {event.extraImageUrls && event.extraImageUrls.length > 0 && (
        <div style={{ marginTop: "30px", display: "flex", flexDirection: "column", gap: "25px" }}>
          {event.extraImageUrls.map((url, idx) => (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  width: "100%",           
                  maxHeight: "650px",      
                  overflow: "auto",        
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",   
                  cursor: "zoom-in",
                  textAlign: "center",     
                  boxSizing: "border-box",
                  padding: "10px",          
                }}
                onClick={() => setModalImage(url)}
              >
                <img
                  src={url}
                  alt={`추가 이미지 ${idx + 1}`}
                  style={{
                    display: "block",
                    margin: "0 auto",      
                    maxWidth: "100%",      
                    height: "auto",        
                  }}
                />
              </div>
              <div style={{ padding: "0 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700 }}>
                    {idx + 1} / {event.extraImageUrls.length}
                 </p>
                 <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700 }}>
                    💡 이미지가 너무 크면 스크롤하거나 클릭해서 보세요.
                 </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 확대 모달창 */}
      {modalImage && (
        <div
          onClick={() => setModalImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0, 0, 0, 0.85)", 
            zIndex: 999999, 
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
            boxSizing: "border-box",
            cursor: "zoom-out" 
          }}
        >
          <img
            src={modalImage}
            alt="확대된 이미지"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: "12px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
            }}
          />
          <div 
            style={{ 
              position: "absolute", 
              top: "25px", 
              right: "30px", 
              color: "#fff", 
              fontSize: "1rem", 
              fontWeight: 900,
              background: "rgba(0,0,0,0.6)",
              padding: "8px 16px",
              borderRadius: "20px",
              cursor: "pointer"
            }}
          >
            ✕ 닫기
          </div>
        </div>
      )}
    </div>
  );
}