import React, { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import {
  uploadEventBanner,
  createEvent,
  fetchAllEvents,
  toggleEventActive,
  removeEvent,
  updateEvent,
} from "../api/eventApi";

// 🔐 관리자 전용 페이지

export default function AdminEvents() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: "", content: "", startDate: "", endDate: "" });
  
  // 📸 대표 배너 이미지 상태
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  // 📸 본문 추가 이미지 상태 (여러 장)
  const [extraImages, setExtraImages] = useState([]); 

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [pickerTarget, setPickerTarget] = useState(null); 
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  const load = () => fetchAllEvents().then(setList).catch(e => console.error(e));
  useEffect(() => { load(); }, []);

  // ====================================================================
  // 📸 파일 첨부 및 삭제 로직
  // ====================================================================
  
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    e.target.value = ""; 
  };

  const removeBannerPreview = () => {
    setFile(null);
    setPreview("");
  };

  const onExtraFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    const newImgs = files.map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setExtraImages(prev => [...prev, ...newImgs]);
    e.target.value = ""; 
  };

  const removeExtraPreview = (idxToRemove) => {
    setExtraImages(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  // ====================================================================

  const reset = () => {
    setForm({ title: "", content: "", startDate: "", endDate: "" });
    setFile(null);
    setPreview("");
    setExtraImages([]); 
    setEditingId(null);
  };

  const onSubmit = async () => {
    if (!form.title || !form.content || !form.startDate || !form.endDate)
      return alert("🚨 모든 필드를 입력해주세요.");
    if (form.startDate > form.endDate)
      return alert("🚨 종료일이 시작일보다 빠를 수 없습니다.");

    setLoading(true);
    try {
      let imageUrl = "";
      let imagePath = "";
      if (file) {
        const up = await uploadEventBanner(file);
        imageUrl = up.url;
        imagePath = up.path;
      }

      let finalExtraUrls = [];
      const filesToUpload = extraImages.filter(img => img.file);
      const keptExistingUrls = extraImages.filter(img => !img.file).map(img => img.url); 

      if (filesToUpload.length > 0) {
        const uploadPromises = filesToUpload.map(img => uploadEventBanner(img.file));
        const results = await Promise.all(uploadPromises);
        const uploadedUrls = results.map(r => r.url);
        finalExtraUrls = [...keptExistingUrls, ...uploadedUrls];
      } else {
        finalExtraUrls = keptExistingUrls;
      }

      if (editingId) {
        const patch = { ...form };
        if (imageUrl) {
          patch.imageUrl = imageUrl;
          patch.imagePath = imagePath;
        }
        patch.extraImageUrls = finalExtraUrls; 

        await updateEvent(editingId, patch);
        alert("✅ 이벤트가 수정되었습니다.");
      } else {
        await createEvent({ 
          ...form, 
          imageUrl, 
          imagePath, 
          extraImageUrls: finalExtraUrls, 
          isActive: true 
        });
        alert("✅ 이벤트가 등록되었습니다.");
      }
      reset();
      load();
    } catch (e) {
      alert("오류: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onToggle = async (ev) => {
    await toggleEventActive(ev.id, !ev.isActive);
    load();
  };

  const onDelete = async (ev) => {
    if (!window.confirm(`'${ev.title}' 이벤트를 삭제하시겠습니까?`)) return;
    await removeEvent(ev.id, ev.imagePath);
    load();
  };

  const onEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || "",
      content: ev.content || "",
      startDate: ev.startDate || "",
      endDate: ev.endDate || "",
    });
    setPreview(ev.imageUrl || "");
    setFile(null);

    if (ev.extraImageUrls && ev.extraImageUrls.length > 0) {
      setExtraImages(ev.extraImageUrls.map(url => ({ file: null, url })));
    } else {
      setExtraImages([]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inputStyle = {
    width: "100%",
    padding: "14px",
    borderRadius: "12px",
    border: "2px solid #e2e8f0",
    background: "#fff",
    fontWeight: 800,
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
    color: "#0f172a",
  };

  const openPicker = (target, currentVal) => {
    setPickerTarget(target);
    if (currentVal) {
      const parsed = new Date(currentVal);
      setPickerDate(parsed);
      setPickerMonth(parsed);
    } else {
      const now = new Date();
      setPickerDate(now);
      setPickerMonth(now);
    }
  };

  const applyPicker = () => {
    const val = format(pickerDate, 'yyyy-MM-dd');
    if (pickerTarget === 'start') {
      setForm({ ...form, startDate: val });
      if (form.endDate && val > form.endDate) {
        setForm(prev => ({ ...prev, endDate: '' })); 
      }
    } else {
      setForm({ ...form, endDate: val });
    }
    setPickerTarget(null);
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(pickerMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDateCal = startOfWeek(monthStart);
    const endDateCal = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDateCal, end: endDateCal });

    return (
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '10px' }}>
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <div key={d} style={{ textAlign:'center', fontWeight:'900', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#94a3b8', fontSize:'0.8rem' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
          {calendarDays.map((day, i) => {
            const isSelected = isSameDay(day, pickerDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isDisabled = pickerTarget === 'end' && form.startDate && format(day, 'yyyy-MM-dd') < form.startDate;

            return (
              <button 
                key={i} 
                disabled={isDisabled}
                onClick={() => setPickerDate(day)} 
                style={{ padding: '10px 0', border: 'none', borderRadius: '8px', cursor: isDisabled ? 'not-allowed' : 'pointer', background: isSelected ? '#2563eb' : 'transparent', color: isSelected ? '#fff' : isDisabled ? '#e2e8f0' : !isCurrentMonth ? '#cbd5e1' : '#1e293b', fontWeight: isSelected ? '900' : '700', fontSize: '0.95rem', transition: '0.2s' }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "30px", position: "relative" }}>
      {/* 등록/수정 폼 */}
      <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 20px 0", color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #2563eb", paddingLeft: "15px", fontSize: "1.4rem" }}>
          {editingId ? "✏️ 이벤트 수정" : "➕ 새 이벤트 등록"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            style={inputStyle}
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            style={{ ...inputStyle, minHeight: "120px", resize: "vertical", fontFamily: "inherit" }}
            placeholder="상세 내용"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "180px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 900, color: "#475569", fontSize: "0.85rem" }}>시작일</label>
              <div
                onClick={() => openPicker('start', form.startDate)}
                style={{ ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ color: form.startDate ? "#0f172a" : "#94a3b8" }}>{form.startDate || "년. 월. 일."}</span>
                <span>📅</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: "180px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 900, color: "#475569", fontSize: "0.85rem" }}>종료일</label>
              <div
                onClick={() => openPicker('end', form.endDate)}
                style={{ ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ color: form.endDate ? "#0f172a" : "#94a3b8" }}>{form.endDate || "년. 월. 일."}</span>
                <span>📅</span>
              </div>
            </div>
          </div>

          {/* 🖼️ 배너 이미지 영역 */}
          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 900, color: "#0f172a", fontSize: "0.95rem" }}>
              메인 이미지 <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.8rem" }}>(1장 업로드 가능)</span> <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input type="file" accept="image/*" onChange={onFile} style={{ ...inputStyle, padding: "10px", background: "#fff" }} />
            {preview && (
              <div style={{ position: "relative", marginTop: "12px", borderRadius: "12px", overflow: "hidden", maxWidth: "400px", aspectRatio: "16 / 7", background: "#e2e8f0", border: "2px solid #cbd5e1" }}>
                <img src={preview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {/* ✨ 훈연 처리된 어두운 회색 삭제 버튼 */}
                <button onClick={removeBannerPreview} title="이미지 삭제" style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: "50%", width: "28px", height: "28px", fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(0,0,0,0.3)" }}>
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* 🖼️ 추가 이미지 영역 (다중 선택) */}
          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 900, color: "#0f172a", fontSize: "0.95rem" }}>
              추가 이미지 <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.8rem" }}>(여러 장 업로드 가능)</span>
            </label>
            <input type="file" multiple accept="image/*" onChange={onExtraFileChange} style={{ ...inputStyle, padding: "10px", background: "#fff" }} />
            
            {extraImages.length > 0 && (
              <div style={{ display: "flex", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
                {extraImages.map((img, idx) => (
                  <div key={idx} style={{ position: "relative", width: "100px", height: "100px", borderRadius: "10px", overflow: "hidden", border: "2px solid #cbd5e1", background: "#fff" }}>
                    <img src={img.url} alt={`extra-${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* ✨ 훈연 처리된 어두운 회색 개별 삭제 버튼 */}
                    <button onClick={() => removeExtraPreview(idx)} title="삭제" style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: "50%", width: "22px", height: "22px", fontSize: "10px", fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button
              onClick={onSubmit}
              disabled={loading}
              style={{
                flex: 2,
                padding: "16px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontWeight: 900,
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)",
              }}
            >
              {loading ? "처리 중..." : editingId ? "수정 완료" : "이벤트 등록"}
            </button>
            {editingId && (
              <button
                onClick={reset}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 등록된 이벤트 목록 */}
      <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 20px 0", color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #dc2626", paddingLeft: "15px", fontSize: "1.4rem" }}>
          📋 등록된 이벤트 ({list.length})
        </h2>

        {list.length === 0 ? (
          <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "30px 0" }}>등록된 이벤트가 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {list.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  gap: "15px",
                  padding: "15px",
                  background: "#f8fafc",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ width: "100px", aspectRatio: "16 / 9", borderRadius: "8px", overflow: "hidden", background: "#e2e8f0", flexShrink: 0 }}>
                  {ev.imageUrl && <img src={ev.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ fontWeight: 900, color: "#0f172a", fontSize: "1rem", marginBottom: "4px" }}>{ev.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>
                    📅 {ev.startDate} ~ {ev.endDate}
                  </div>
                </div>

                <label style={{ position: "relative", width: "50px", height: "28px", cursor: "pointer", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={!!ev.isActive}
                    onChange={() => onToggle(ev)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: ev.isActive ? "#2563eb" : "#cbd5e1",
                      borderRadius: "14px",
                      transition: "0.2s",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: ev.isActive ? "25px" : "3px",
                      width: "22px",
                      height: "22px",
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "0.2s",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                    }}
                  />
                </label>
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: "0.8rem",
                    color: ev.isActive ? "#2563eb" : "#94a3b8",
                    minWidth: "40px",
                  }}
                >
                  {ev.isActive ? "게시" : "숨김"}
                </span>

                <button
                  onClick={() => onEdit(ev)}
                  style={{
                    padding: "8px 12px",
                    background: "#eff6ff",
                    color: "#2563eb",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  수정
                </button>
                <button
                  onClick={() => onDelete(ev)}
                  style={{
                    padding: "8px 12px",
                    background: "#fee2e2",
                    color: "#dc2626",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 팝업 달력 */}
      {pickerTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>
              {pickerTarget === 'start' ? '🟢 시작일 설정' : '🔴 종료일 설정'}
            </h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '12px' }}>
              <button onClick={() => setPickerMonth(subMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#0f172a' }}>◀</button>               
              <h4 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem', color: '#0f172a' }}>{format(pickerMonth, 'yyyy년 M월')}</h4>
              <button onClick={() => setPickerMonth(addMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#0f172a' }}>▶</button>
            </div>

            {renderCalendar()}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setPickerTarget(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#e2e8f0', color: '#475569', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>취소</button>
              <button onClick={applyPicker} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>✅ 적용하기</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}