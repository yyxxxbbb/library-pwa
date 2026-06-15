import React, { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { doc, onSnapshot, setDoc } from "firebase/firestore"; // 💡 시설 상태 관리를 위해 추가!
import { auth, db } from '../firebase'; // 💡 db 임포트 추가!
import {
  uploadEventBanner,
  createEvent,
  fetchAllEvents,
  toggleEventActive,
  removeEvent,
  updateEvent,
} from "../api/eventApi";
import { createNotice, fetchAllNotices, updateNotice, removeNotice, toggleNoticeActive } from "../api/noticeApi";

export default function AdminEvents() {
  const [list, setList] = useState([]);
  const [docType, setDocType] = useState("NOTICE");
  const [form, setForm] = useState({ title: "", content: "", startDate: "", endDate: "", isActive: true });
  
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [extraImages, setExtraImages] = useState([]); 

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [pickerTarget, setPickerTarget] = useState(null); 
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  const [toggleTarget, setToggleTarget] = useState(null);

  // 💡 [핵심 추가] 시설 상태 데이터 상태 (기본값 AUTO 추가!)
  const [facilityStatus, setFacilityStatus] = useState({ '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });

  // 💡 [핵심 추가] DB에서 실시간 시설 상태 불러오기
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'facilityStatus'), (docSnap) => {
      if (docSnap.exists()) {
        setFacilityStatus(docSnap.data());
      } else {
        // 최초 실행 시 문서 생성
        setDoc(doc(db, 'System', 'facilityStatus'), { '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });
      }
    });
    return () => unsub();
  }, []);

  // 💡 [핵심 추가] 시설 상태 변경 함수
  const updateFacility = async (floor, status) => {
    try {
      await setDoc(doc(db, 'System', 'facilityStatus'), { [floor]: status }, { merge: true });
    } catch (e) {
      alert("상태 변경 중 오류가 발생했습니다.");
    }
  };

  const load = async () => {
    try {
      const evs = await fetchAllEvents().catch(() => []);
      const notis = await fetchAllNotices().catch(() => []);
      
      const combined = [
        ...evs.map(e => ({ ...e, _type: 'EVENT' })),
        ...notis.map(n => ({ ...n, _type: 'NOTICE' }))
      ];
      
      combined.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.startDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.startDate || 0).getTime();
        return timeB - timeA;
      });
      
      setList(combined);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const onTogglePin = async (ev) => {
    try {
      const newStatus = !ev.isPinned;
      if (ev._type === "EVENT") {
        await updateEvent(ev.id, { isPinned: newStatus });
      } else {
        await updateNotice(ev.id, { isPinned: newStatus });
      }
      load(); 
    } catch (e) {
      alert("고정 처리 중 오류가 발생했습니다.");
    }
  };

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

  const reset = () => {
    setForm({ title: "", content: "", startDate: "", endDate: "", isActive: true });
    setFile(null);
    setPreview("");
    setExtraImages([]); 
    setEditingId(null);
    setDocType("NOTICE");
  };

  const onSubmit = async () => {
    if (!form.title || !form.content)
      return alert("🚨 제목과 상세 내용을 입력해주세요.");
      
    if (docType === "EVENT") {
      if (!form.startDate || !form.endDate) return alert("🚨 이벤트는 시작일과 종료일이 필수입니다.");
      if (form.startDate > form.endDate) return alert("🚨 종료일이 시작일보다 빠를 수 없습니다.");
    }

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
        finalExtraUrls = [...keptExistingUrls, ...results.map(r => r.url)];
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

        if (docType === "EVENT") await updateEvent(editingId, patch);
        else await updateNotice(editingId, patch);

        alert(`✅ ${docType === "EVENT" ? "이벤트" : "공지사항"}가 수정되었습니다.`);
      } else {
        const dataToSave = { 
          ...form, 
          imageUrl, 
          imagePath, 
          extraImageUrls: finalExtraUrls,
          isPinned: false 
        };

        if (docType === "EVENT") await createEvent(dataToSave);
        else await createNotice(dataToSave);

        alert(`✅ ${docType === "EVENT" ? "이벤트" : "공지사항"}가 등록되었습니다.`);
      }
      reset();
      load();
    } catch (e) {
      alert("오류: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (ev) => {
    const typeLabel = ev._type === "EVENT" ? "이벤트" : "공지사항";
    if (!window.confirm(`'${ev.title}' ${typeLabel}를 삭제하시겠습니까?`)) return;

    if (ev._type === "EVENT") await removeEvent(ev.id, ev.imagePath);
    else await removeNotice(ev.id, ev.imagePath);
    
    load();
  };

  const onEdit = (ev) => {
    setEditingId(ev.id);
    setDocType(ev._type || "EVENT"); 
    setForm({
      title: ev.title || "",
      content: ev.content || "",
      startDate: ev.startDate || "",
      endDate: ev.endDate || "",
      isActive: ev.isActive !== undefined ? ev.isActive : true, 
    });
    setPreview(ev.imageUrl || "");
    setFile(null);
    setExtraImages(ev.extraImageUrls && ev.extraImageUrls.length > 0 ? ev.extraImageUrls.map(url => ({ file: null, url })) : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inputStyle = { width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #e2e8f0", background: "#fff", fontWeight: 800, fontSize: "0.95rem", outline: "none", boxSizing: "border-box", color: "#0f172a" };

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
      if (form.endDate && val > form.endDate) setForm(prev => ({ ...prev, endDate: '' })); 
    } else setForm({ ...form, endDate: val });
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
              <button key={i} disabled={isDisabled} onClick={() => setPickerDate(day)} style={{ padding: '10px 0', border: 'none', borderRadius: '8px', cursor: isDisabled ? 'not-allowed' : 'pointer', background: isSelected ? '#2563eb' : 'transparent', color: isSelected ? '#fff' : isDisabled ? '#e2e8f0' : !isCurrentMonth ? '#cbd5e1' : '#1e293b', fontWeight: isSelected ? '900' : '700', fontSize: '0.95rem', transition: '0.2s' }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderListItem = (ev) => (
    <div
      key={ev.id}
      style={{
        display: "flex",
        gap: "15px",
        padding: "15px",
        background: ev.isPinned ? "#fffbeb" : "#f8fafc", 
        borderRadius: "16px",
        border: ev.isPinned ? "1px solid #f59e0b" : "1px solid #e2e8f0",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button 
        onClick={() => onTogglePin(ev)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", padding: "0 5px", color: ev.isPinned ? "#f59e0b" : "#cbd5e1", transition: "0.2s" }}
        title={ev.isPinned ? "고정 해제" : "메인 배너 최상단 고정"}
      >
        {ev.isPinned ? "★" : "☆"}
      </button>

      <div style={{ width: "80px", aspectRatio: "16 / 9", borderRadius: "8px", overflow: "hidden", background: "#e2e8f0", flexShrink: 0 }}>
        {ev.imageUrl && <img src={ev.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>

      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
          {ev.isPinned && <span style={{ fontSize: "0.6rem", background: "#f59e0b", color: "#fff", padding: "1px 5px", borderRadius: "4px", fontWeight: 900 }}>FIXED</span>}
          <span style={{ background: ev._type === "NOTICE" ? "#eff6ff" : "#fef08a", color: ev._type === "NOTICE" ? "#2563eb" : "#ca8a04", padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 900 }}>
            {ev._type === "NOTICE" ? "공지" : "이벤트"}
          </span>
          <span style={{ fontWeight: 900, color: "#0f172a", fontSize: "1rem" }}>{ev.title}</span>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>
          {ev._type === "EVENT" ? `📅 ${ev.startDate} ~ ${ev.endDate}` : `📅 작성일: ${ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('ko-KR') : ''}`}
        </div>
      </div>

      <label style={{ position: "relative", width: "50px", height: "28px", cursor: "pointer", flexShrink: 0 }}>
        <input type="checkbox" checked={!!ev.isActive} onChange={() => setToggleTarget(ev)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: "absolute", inset: 0, background: ev.isActive ? "#2563eb" : "#cbd5e1", borderRadius: "14px", transition: "0.2s" }} />
        <span style={{ position: "absolute", top: "3px", left: ev.isActive ? "25px" : "3px", width: "22px", height: "22px", background: "#fff", borderRadius: "50%", transition: "0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} />
      </label>
      <span style={{ fontWeight: 900, fontSize: "0.8rem", color: ev.isActive ? "#2563eb" : "#94a3b8", minWidth: "40px" }}>{ev.isActive ? "게시" : "숨김"}</span>

      <button onClick={() => onEdit(ev)} style={{ padding: "8px 12px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: "8px", fontWeight: 900, cursor: "pointer", fontSize: "0.85rem" }}>수정</button>
      <button onClick={() => onDelete(ev)} style={{ padding: "8px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: "8px", fontWeight: 900, cursor: "pointer", fontSize: "0.85rem" }}>삭제</button>
    </div>
  );

  const noticeList = list.filter((item) => item._type === "NOTICE");
  const eventList = list.filter((item) => item._type === "EVENT");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "30px", position: "relative" }}>
      
      {/* ==================================================================== */}
      {/* 💡 [핵심 추가] 시설 상태 실시간 제어 패널 */}
      {/* ==================================================================== */}
      <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 20px 0", color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #10b981", paddingLeft: "15px", fontSize: "1.4rem" }}>
          시설 실시간 제어
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
          {['1층', '2층', '4층'].map(floor => (
            <div key={floor} style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", fontWeight: 900, color: "#0f172a" }}>{floor === '4층' ? '4층 열람실' : `${floor} 도서관`}</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { val: 'AUTO', label: '자동', color: '#8b5cf6' },
                  { val: 'AVAILABLE', label: '이용 가능', color: floor === '4층' ? '#2563eb' : '#2563eb' },
                  { val: 'CROWDED', label: '혼잡', color: '#f59e0b' },
                  { val: 'UNAVAILABLE', label: '이용 불가', color: '#dc2626' }
                ].map(opt => {
                  const isActive = facilityStatus[floor] === opt.val;
                  return (
                    <button
                      key={opt.val}
                      onClick={() => updateFacility(floor, opt.val)}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: "10px", border: "none", fontWeight: 900, fontSize: "0.8rem", cursor: "pointer", transition: "0.2s",
                        background: isActive ? opt.color : "#e2e8f0",
                        color: isActive ? "#fff" : "#475569",
                        boxShadow: isActive ? `0 4px 10px ${opt.color}40` : "none"
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 20px 0", color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #2563eb", paddingLeft: "15px", fontSize: "1.4rem" }}>
          {editingId ? "✏️ 게시글 수정" : "➕ 새로운 게시글 등록"}
        </h2>

        <div style={{ display: "flex", gap: "20px", marginBottom: "20px", padding: "15px", background: "#f1f5f9", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 900, fontSize: "1rem", color: docType === "NOTICE" ? "#2563eb" : "#64748b", transition: "0.2s" }}>
            <input type="radio" name="docType" checked={docType === "NOTICE"} onChange={() => setDocType("NOTICE")} style={{ width: "18px", height: "18px", marginRight: "8px", accentColor: "#2563eb", cursor: "pointer" }} />
            공지사항
          </label>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 900, fontSize: "1rem", color: docType === "EVENT" ? "#2563eb" : "#64748b", transition: "0.2s" }}>
            <input type="radio" name="docType" checked={docType === "EVENT"} onChange={() => setDocType("EVENT")} style={{ width: "18px", height: "18px", marginRight: "8px", accentColor: "#2563eb", cursor: "pointer" }} />
            이벤트
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input style={inputStyle} placeholder="제목" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: "120px", resize: "vertical", fontFamily: "inherit" }} placeholder="상세 내용" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />

          {docType === "EVENT" && (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 900, color: "#475569", fontSize: "0.85rem" }}>시작일</label>
                <div onClick={() => openPicker('start', form.startDate)} style={{ ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} >
                  <span style={{ color: form.startDate ? "#0f172a" : "#94a3b8" }}>{form.startDate || "연도. 월. 일."}</span><span>📅</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 900, color: "#475569", fontSize: "0.85rem" }}>종료일</label>
                <div onClick={() => openPicker('end', form.endDate)} style={{ ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} >
                  <span style={{ color: form.endDate ? "#0f172a" : "#94a3b8" }}>{form.endDate || "연도. 월. 일."}</span><span>📅</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 900, color: "#0f172a", fontSize: "0.95rem" }}>
              메인 이미지 <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.8rem" }}>(1장 업로드 가능)</span> <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input type="file" accept="image/*" onChange={onFile} style={{ ...inputStyle, padding: "10px", background: "#fff" }} />
            {preview && (
              <div style={{ position: "relative", marginTop: "12px", borderRadius: "12px", overflow: "hidden", maxWidth: "400px", aspectRatio: "16 / 7", background: "#e2e8f0", border: "2px solid #cbd5e1" }}>
                <img src={preview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={removeBannerPreview} title="이미지 삭제" style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: "50%", width: "28px", height: "28px", fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(0,0,0,0.3)" }}>✕</button>
              </div>
            )}
          </div>

          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 900, color: "#0f172a", fontSize: "0.95rem" }}>
              추가 이미지 <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.8rem" }}>(여러 장 업로드 가능)</span>
            </label>
            <input type="file" multiple accept="image/*" onChange={onExtraFileChange} style={{ ...inputStyle, padding: "10px", background: "#fff" }} />
            {extraImages.length > 0 && (
              <div style={{ display: "flex", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
                {extraImages.map((img, idx) => (
                  <div key={idx} style={{ position: "relative", width: "120px", height: "120px", borderRadius: "10px", overflow: "hidden", border: "2px solid #cbd5e1", background: "#fff", padding: "4px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={img.url} alt={`extra-${idx}`} style={{ maxWidth: "100%", maxHeight: "100%", height: "auto", width: "auto", objectFit: "contain" }} />
                    <button onClick={() => removeExtraPreview(idx)} title="삭제" style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: "50%", width: "22px", height: "22px", fontSize: "10px", fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "#f8fafc", padding: "18px 20px", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontWeight: 900, color: "#0f172a", fontSize: "0.95rem", marginBottom: "4px" }}>글 업로드 상태 설정</label>
              <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>{form.isActive ? "🟢 등록 후 즉시 사용자에게 공개됩니다." : "🔴 숨김 상태로 등록되며, 사용자는 볼 수 없습니다."}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ position: "relative", width: "50px", height: "28px", cursor: "pointer" }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: "absolute", inset: 0, background: form.isActive ? "#2563eb" : "#cbd5e1", borderRadius: "14px", transition: "0.2s" }} />
                <span style={{ position: "absolute", top: "3px", left: form.isActive ? "25px" : "3px", width: "22px", height: "22px", background: "#fff", borderRadius: "50%", transition: "0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} />
              </label>
              <span style={{ fontWeight: 900, fontSize: "0.85rem", color: form.isActive ? "#2563eb" : "#94a3b8", minWidth: "35px" }}>{form.isActive ? "게시" : "숨김"}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button onClick={onSubmit} disabled={loading} style={{ flex: 2, padding: "16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 900, fontSize: "1rem", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)" }}>
              {loading ? "처리 중..." : editingId ? "수정 완료" : "게시글 등록"}
            </button>
            {editingId && <button onClick={reset} style={{ flex: 1, padding: "16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>취소</button>}
          </div>
        </div>
      </div>

      {/* 📋 등록된 전체 글 목록 (공지사항 / 이벤트 분리) */}
      <div style={{ background: "#fff", padding: "30px", borderRadius: "25px", boxShadow: "0 5px 20px rgba(0,0,0,0.05)" }}>
        <h2 style={{ margin: "0 0 20px 0", color: "#0f172a", fontWeight: 900, borderLeft: "6px solid #dc2626", paddingLeft: "15px", fontSize: "1.4rem" }}>
          📋 등록된 전체 글 ({list.length})
        </h2>

        {list.length === 0 ? (
          <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "30px 0" }}>등록된 글이 없습니다.</p>
        ) : (
          <>
            <div style={{ marginBottom: noticeList.length > 0 ? "30px" : "15px" }}>
              <h3 style={{ margin: "0 0 15px 0", color: "#334155", fontWeight: 900, fontSize: "1.1rem", borderBottom: "2px solid #f1f5f9", paddingBottom: "10px" }}>📢 공지사항 ({noticeList.length})</h3>
              {noticeList.length === 0 ? <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "10px 0", fontSize: "0.9rem" }}>등록된 공지사항이 없습니다.</p> : <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{noticeList.map(renderListItem)}</div>}
            </div>

            <div>
              <h3 style={{ margin: "0 0 15px 0", color: "#334155", fontWeight: 900, fontSize: "1.1rem", borderBottom: "2px solid #f1f5f9", paddingBottom: "10px" }}>🎉 이벤트 ({eventList.length})</h3>
              {eventList.length === 0 ? <p style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700, padding: "10px 0", fontSize: "0.9rem" }}>등록된 이벤트가 없습니다.</p> : <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{eventList.map(renderListItem)}</div>}
            </div>
          </>
        )}
      </div>

      {/* 팝업 달력 */}
      {pickerTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>{pickerTarget === 'start' ? '🟢 시작일 설정' : '🔴 종료일 설정'}</h3>
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

      {/* 상태 토글 확인용 모달 팝업 */}
      {toggleTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: '900', color: '#0f172a' }}>{toggleTarget.isActive ? "🔒 숨김 처리 확인" : "🔓 게시 처리 확인"}</h3>
            <p style={{ margin: '0 0 24px 0', color: '#475569', fontWeight: 700, fontSize: '0.95rem', lineHeight: '1.6' }}>정말로 '{toggleTarget.title}' 글을<br /><span style={{ color: toggleTarget.isActive ? "#dc2626" : "#2563eb", fontWeight: 900 }}>{toggleTarget.isActive ? "숨김 처리 하시겠습니까?" : "게시 처리를 하시겠습니까?"}</span></p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setToggleTarget(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#e2e8f0', color: '#475569', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>아니오</button>
              <button onClick={async () => {
                  if (toggleTarget._type === "EVENT") await toggleEventActive(toggleTarget.id, !toggleTarget.isActive);
                  else await toggleNoticeActive(toggleTarget.id, !toggleTarget.isActive);
                  setToggleTarget(null); load(); 
              }} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: toggleTarget.isActive ? "#dc2626" : "#2563eb", color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>네</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}