import React, { useEffect, useState } from "react";
import { fetchActiveEvents } from "../api/eventApi";

// 👤 메인 화면 상단 활성 이벤트 자동 슬라이드 배너
//    - 로그인된 사용자에게만 노출 (App.jsx에서 user 체크 후 렌더)
//    - isActive === true 이벤트만 4초 간격으로 순환

export default function EventBanner({ onSeeAll, onSelectEvent }) {
  const [events, setEvents] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetchActiveEvents()
      .then((list) => setEvents(list || []))
      .catch((err) => console.error("이벤트 로드 실패:", err));
  }, []);

  useEffect(() => {
    if (events.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % events.length);
    }, 4000);
    return () => clearInterval(t);
  }, [events]);

  if (events.length === 0) return null;

  const e = events[idx];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "20px",
        padding: "20px",
        marginBottom: "20px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontWeight: 900,
            color: "#0f172a",
            fontSize: "1.1rem",
          }}
        >
          📢 진행 중인 이벤트
        </h3>
        <button
          onClick={onSeeAll}
          style={{
            background: "#eff6ff",
            color: "#2563eb",
            border: "none",
            borderRadius: "10px",
            padding: "8px 14px",
            fontWeight: 900,
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          더 보기 →
        </button>
      </div>

      <div
        onClick={() => onSelectEvent && onSelectEvent(e)}
        style={{
          position: "relative",
          borderRadius: "16px",
          overflow: "hidden",
          cursor: "pointer",
          background: "#f1f5f9",
          aspectRatio: "16 / 7",
        }}
      >
        {e.imageUrl ? (
          <img
            src={e.imageUrl}
            alt={e.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontWeight: 900,
            }}
          >
            이미지 없음
          </div>
        )}

        {/* ====================================================================
            ✨ [변경됨] 글씨 배경 그라데이션 강화 (가독성 향상)
            ==================================================================== */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "50px 16px 16px 16px", // 위쪽 패딩을 늘려서 그라데이션이 높게 퍼지도록 함
            background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0) 100%)", // 더 어둡고 자연스러운 그라데이션
            color: "#fff",
            zIndex: 10, // 이미지를 덮도록 명시
          }}
        >
          <div style={{ fontWeight: 900, fontSize: "1.1rem", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>{e.title}</div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9, marginTop: "4px", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            {e.startDate} ~ {e.endDate}
          </div>
        </div>
      </div>

      {events.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "6px",
            marginTop: "10px",
          }}
        >
          {events.map((_, i) => (
            <div
              key={i}
              onClick={() => setIdx(i)}
              style={{
                width: i === idx ? "20px" : "6px",
                height: "6px",
                borderRadius: "3px",
                background: i === idx ? "#2563eb" : "#cbd5e1",
                cursor: "pointer",
                transition: "0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}