import React, { useState, useRef, useEffect, createRef } from 'react';
import Draggable from 'react-draggable';
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, onSnapshot, setDoc, arrayUnion } from "firebase/firestore"; 
import { db, storage } from '../firebase'; 

const FloorMap = ({ 
  activeFloor, title, seats, user, isAdmin, currentUserData, viewMode, now, 
  setSelectedSeat, onUpdateSeats, onDeleteSeat 
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [mapSeats, setMapSeats] = useState([]);
  
  const [selectedSeatGroups, setSelectedSeatGroups] = useState([]);
  const flatSelectedIds = selectedSeatGroups.flat();

  const [showToast, setShowToast] = useState(false);
  const [guides, setGuides] = useState({ v: [], h: [] }); 
  const [selectionBox, setSelectionBox] = useState(null); 

  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [gallery, setGallery] = useState([]); 
  const [showGallery, setShowGallery] = useState(false);

  const isMobile = window.innerWidth < 768;
  const [zoomLevel, setZoomLevel] = useState(isMobile ? 0.45 : 0.85);

  const seatRefs = useRef({});
  const seatInnerRefs = useRef({}); 
  const seatDragData = useRef({});  
  
  const lastSelectedSeatId = useRef(null);
  
  // ✅ [신규] 편집 창(인스펙터 패널)의 마지막 위치를 기억하는 캐시 메모리 (창이 꺼져도 좌표 유지)
  const inspectorPos = useRef({ x: 0, y: 0 });

  const inspectorRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const mapRef = useRef(null); 
  const dragState = useRef({ isDown: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    if (!seats || !Array.isArray(seats)) return; 
    
    const floorSeats = seats.filter(seat => seat.id.startsWith(activeFloor));
    
    setMapSeats(prev => {
      if (isEditMode) {
        if (prev.length > 0 && prev[0].id.startsWith(activeFloor)) return prev; 
        return floorSeats.map((seat, index) => ({
          ...seat,
          x: seat.x ?? (index % 8) * 120 + 50,
          y: seat.y ?? Math.floor(index / 8) * 100 + 50,
          width: seat.width ?? 75,
          height: seat.height ?? 65,
          isLocked: seat.isLocked ?? false 
        }));
      }
      return floorSeats.map((seat, index) => ({
        ...seat,
        x: seat.x ?? (index % 8) * 120 + 50,
        y: seat.y ?? Math.floor(index / 8) * 100 + 50,
        width: seat.width ?? 75,
        height: seat.height ?? 65,
        isLocked: seat.isLocked ?? false
      }));
    });

    const unsubBg = onSnapshot(doc(db, 'FloorPlans', activeFloor), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBackgroundUrl(data.url);
        if (data.history) setGallery(data.history); else setGallery([]);
      } else {
        setBackgroundUrl(""); setGallery([]);
      }
    });

    return () => unsubBg();
  }, [seats, activeFloor, isEditMode]);

  const updateSeatData = (id, field, value) => {
    setMapSeats(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: field === 'label' || field === 'isLocked' ? value : parseInt(value, 10) || 0 } : s
    ));
  };

  const handleSave = async () => {
    try {
      if (typeof onUpdateSeats !== 'function') throw new Error("상위 컴포넌트에서 저장 함수가 연결되지 않았습니다!");

      const safeSeats = mapSeats.map(seat => {
        const safeData = { ...seat };
        Object.keys(safeData).forEach(key => { if (safeData[key] === undefined) delete safeData[key]; });
        safeData.x = Number(safeData.x) || 0;
        safeData.y = Number(safeData.y) || 0;
        safeData.width = Number(safeData.width) || 75;
        safeData.height = Number(safeData.height) || 65;
        safeData.isLocked = Boolean(safeData.isLocked); 
        return safeData;
      });

      await onUpdateSeats(safeSeats);
      setShowToast(true); setTimeout(() => setShowToast(false), 2000);
    } catch (e) {
      alert(`저장 실패!\n원인: ${e.message}`);
    }
  };

  const handleFloorPlanUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsUploading(true); setUploadProgress(0);
    const fileName = `${Date.now()}_${file.name}`;
    const storagePath = `floor_plans/${activeFloor}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), 
      (error) => { setIsUploading(false); alert("업로드 실패"); }, 
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newImageObj = { url: downloadURL, fileName: fileName, uploadedAt: Date.now() };
          await setDoc(doc(db, 'FloorPlans', activeFloor), { url: downloadURL, lastUpdated: new Date(), fileName: fileName, history: arrayUnion(newImageObj) }, { merge: true }); 
          setIsUploading(false); alert(`도면이 업로드 되었습니다.`);
        } catch (err) { setIsUploading(false); alert(`DB 저장 실패`); }
      }
    );
  };

  const handleApplyFromGallery = async (imgObj) => {
    try {
      await setDoc(doc(db, 'FloorPlans', activeFloor), { url: imgObj.url, fileName: imgObj.fileName, lastUpdated: new Date() }, { merge: true });
      setShowGallery(false); alert('도면이 변경되었습니다!');
    } catch (err) { alert('도면 변경 실패!'); }
  };

  const handleMouseDown = (e) => {
    // ✅ 도면 바깥쪽의 빈 공간(패닝 영역)을 클릭했을 때도 선택을 즉시 해제
    if (isEditMode && !e.target.closest('.seat-element') && !e.target.closest('.map-container-inner') && !e.target.closest('.no-pan')) {
      setSelectedSeatGroups([]);
      lastSelectedSeatId.current = null;
    }

    if (e.target.closest('.no-pan') || e.target.closest('.seat-element') || e.target.closest('.map-container-inner')) return; 
    
    const map = scrollRef.current;
    dragState.current.isDown = true; map.style.cursor = 'grabbing';
    dragState.current.startX = e.pageX - map.offsetLeft; dragState.current.startY = e.pageY - map.offsetTop;
    dragState.current.scrollLeft = map.scrollLeft; dragState.current.scrollTop = map.scrollTop;
  };

  const handleMouseLeave = () => { dragState.current.isDown = false; if (scrollRef.current) scrollRef.current.style.cursor = isEditMode ? 'default' : 'grab'; };
  const handleMouseUp = () => { dragState.current.isDown = false; if (scrollRef.current) scrollRef.current.style.cursor = isEditMode ? 'default' : 'grab'; };
  const handleMouseMove = (e) => {
    if (!dragState.current.isDown) return; e.preventDefault();
    const map = scrollRef.current;
    map.scrollLeft = dragState.current.scrollLeft - ((e.pageX - map.offsetLeft - dragState.current.startX) * 1.5);
    map.scrollTop = dragState.current.scrollTop - ((e.pageY - map.offsetTop - dragState.current.startY) * 1.5);
  };

  const handleMapWrapperMouseDown = (e) => {
    if (!isEditMode || e.target.closest('.seat-element')) return;
    e.stopPropagation(); 
    
    // ✅ 도면 안쪽 빈 공간을 마우스로 '누르는 순간' 바로 선택 해제 (단축키 없을 때만)
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedSeatGroups([]);
      lastSelectedSeatId.current = null;
    }

    const rect = mapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel; const y = (e.clientY - rect.top) / zoomLevel;
    setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y }); 
  };

  const handleMapWrapperMouseMove = (e) => {
    if (!isEditMode || !selectionBox) return; e.stopPropagation();
    const rect = mapRef.current.getBoundingClientRect();
    setSelectionBox(prev => ({ ...prev, currentX: (e.clientX - rect.left) / zoomLevel, currentY: (e.clientY - rect.top) / zoomLevel }));
  };

  const handleMapWrapperMouseUp = (e) => {
    if (!isEditMode || !selectionBox) return; e.stopPropagation();
    const x1 = Math.min(selectionBox.startX, selectionBox.currentX); const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
    const x2 = Math.max(selectionBox.startX, selectionBox.currentX); const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

    if (x2 - x1 > 5 || y2 - y1 > 5) {
      const selectedIds = mapSeats.filter(seat => {
        const sX = Number(seat.x); const sY = Number(seat.y); const sW = Number(seat.width ?? 75); const sH = Number(seat.height ?? 65);
        return (sX < x2 && sX + sW > x1 && sY < y2 && sY + sH > y1);
      }).map(s => s.id);
      
      if (selectedIds.length > 0) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          setSelectedSeatGroups(prev => [...prev, selectedIds]);
        } else {
          setSelectedSeatGroups([selectedIds]);
        }
      }
    } 
    setSelectionBox(null);
  };

  const isAllLocked = flatSelectedIds.length > 0 && flatSelectedIds.every(id => mapSeats.find(s => s.id === id)?.isLocked);
  
  const checkLockAndRun = (actionFn) => {
    if (flatSelectedIds.some(id => mapSeats.find(s => s.id === id)?.isLocked)) {
      alert("🔒 잠긴 좌석이 포함되어 있어 위치를 일괄 조정할 수 없습니다.");
      return;
    }
    actionFn();
  };

  const handleToggleLock = () => {
    const newLockState = !isAllLocked;
    setMapSeats(prev => prev.map(s => flatSelectedIds.includes(s.id) ? { ...s, isLocked: newLockState } : s));
  };

  const handleAlignTop = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        if (group.length < 2) return;
        const minY = Math.min(...next.filter(s => group.includes(s.id)).map(s => Number(s.y)));
        next = next.map(s => group.includes(s.id) ? { ...s, y: minY } : s);
      });
      return next;
    });
  };

  const handleAlignLeft = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        if (group.length < 2) return;
        const minX = Math.min(...next.filter(s => group.includes(s.id)).map(s => Number(s.x)));
        next = next.map(s => group.includes(s.id) ? { ...s, x: minX } : s);
      });
      return next;
    });
  };

  const handleAlignHorizontalCenter = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        if (group.length < 2) return;
        const groupSeats = next.filter(s => group.includes(s.id));
        const avgCenterY = groupSeats.reduce((sum, s) => sum + Number(s.y) + Number(s.height ?? 65)/2, 0) / groupSeats.length;
        next = next.map(s => group.includes(s.id) ? { ...s, y: Math.round(avgCenterY - Number(s.height ?? 65)/2) } : s);
      });
      return next;
    });
  };

  const handleAlignVerticalCenter = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        if (group.length < 2) return;
        const groupSeats = next.filter(s => group.includes(s.id));
        const avgCenterX = groupSeats.reduce((sum, s) => sum + Number(s.x) + Number(s.width ?? 75)/2, 0) / groupSeats.length;
        next = next.map(s => group.includes(s.id) ? { ...s, x: Math.round(avgCenterX - Number(s.width ?? 75)/2) } : s);
      });
      return next;
    });
  };

  const handleDistributeHorizontal = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        const seatsToMove = next.filter(s => group.includes(s.id)).sort((a, b) => Number(a.x) - Number(b.x));
        if (seatsToMove.length < 3) return; 
        
        const first = seatsToMove[0]; const last = seatsToMove[seatsToMove.length - 1];
        const step = (last.x - first.x) / (seatsToMove.length - 1);
        
        next = next.map(s => {
          if (group.includes(s.id) && s.id !== first.id && s.id !== last.id) {
            const idx = seatsToMove.findIndex(ms => ms.id === s.id);
            return { ...s, x: Math.round(first.x + step * idx) };
          }
          return s;
        });
      });
      return next;
    });
  };

  const handleDistributeVertical = () => {
    setMapSeats(prev => {
      let next = [...prev];
      selectedSeatGroups.forEach(group => {
        const seatsToMove = next.filter(s => group.includes(s.id)).sort((a, b) => Number(a.y) - Number(b.y));
        if (seatsToMove.length < 3) return;
        
        const first = seatsToMove[0]; const last = seatsToMove[seatsToMove.length - 1];
        const step = (last.y - first.y) / (seatsToMove.length - 1);
        
        next = next.map(s => {
          if (group.includes(s.id) && s.id !== first.id && s.id !== last.id) {
            const idx = seatsToMove.findIndex(ms => ms.id === s.id);
            return { ...s, y: Math.round(first.y + step * idx) };
          }
          return s;
        });
      });
      return next;
    });
  };

  return (
    <div style={{ position: 'relative', padding: isMobile ? '15px' : '25px', background: '#ffffff', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', maxWidth: '100%', boxSizing: 'border-box' }}>
      <style>{`.hide-scroll::-webkit-scrollbar { display: none; } .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .click-flash-btn { transition: background-color 0.1s ease, transform 0.1s ease !important; }
        .click-flash-btn:active { background-color: #3b82f6 !important; transform: scale(0.95) !important; }`}
        </style>

      {isUploading && (
        <div className="no-pan" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(30,41,59,0.9)', zIndex: 10002, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '24px' }}>
          <div style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', marginBottom: '15px' }}>🚀 도면 전송 중... {uploadProgress}%</div>
          <div style={{ width: '60%', height: '8px', background: '#475569', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <div className="no-pan" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '15px 30px', background: 'rgba(16, 185, 129, 0.95)', color: '#fff', borderRadius: '50px', fontWeight: '900', fontSize: '1.1rem', zIndex: 10001, pointerEvents: 'none', transition: 'opacity 0.3s ease', opacity: showToast ? 1 : 0, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        ✅ 저장이 완료되었습니다!
      </div>

      <div className="no-pan" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#0f172a', fontSize: '1.5rem', borderLeft: '6px solid #2563eb', paddingLeft: '15px', margin: 0, fontWeight: '900' }}>{title}</h2>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {isEditMode && (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFloorPlanUpload} style={{ display: 'none' }} />
                <button onClick={() => setShowGallery(!showGallery)} style={{ padding: '10px 16px', background: showGallery ? '#2563eb' : '#334155', color: 'white', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>📂 보관함</button>
                <button onClick={() => fileInputRef.current.click()} style={{ padding: '10px 16px', background: '#334155', color: 'white', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>🖼️ 새 도면</button>
                <button onClick={handleSave} style={{ padding: '10px 20px', background: '#10b981', color: 'white', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '900', fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>💾 전체 저장</button>
              </>
            )}
            <button onClick={() => { setIsEditMode(!isEditMode); setSelectedSeatGroups([]); setShowGallery(false); }} style={{ padding: '10px 20px', background: isEditMode ? '#ef4444' : '#f1f5f9', color: isEditMode ? 'white' : '#475569', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '900', fontSize: '0.9rem' }}>
              {isEditMode ? "✖ 편집 종료" : "⚙ 도면 편집"}
            </button>
          </div>
        )}
      </div>

      <div 
        ref={scrollRef} className="hide-scroll"
        onMouseDown={handleMouseDown} onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}
        style={{ width: '100%', height: '65vh', minHeight: '550px', overflow: 'auto', background: isEditMode ? '#f1f5f9' : '#f8fafc', border: isEditMode ? '2px dashed #94a3b8' : 'none', borderRadius: '16px', position: 'relative', WebkitOverflowScrolling: 'touch', cursor: isEditMode ? (selectionBox ? 'crosshair' : 'default') : 'grab', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px', boxSizing: 'border-box' }}>
        
        <div className="no-pan" style={{ position: 'fixed', bottom: '120px', right: '30px', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.15, 1.3))} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>+</button>
          <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.15, 0.35))} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>-</button>
        </div>

        {isEditMode && showGallery && (
          <div className="no-pan" style={{ position: 'sticky', top: '15px', left: '15px', right: '15px', background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '15px', padding: '20px', zIndex: 10000, border: '1px solid #475569', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'flex', gap: '15px', overflowX: 'auto', margin: '15px' }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px' }}><button onClick={() => setShowGallery(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer' }}>✖</button></div>
            {gallery.length === 0 ? ( <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '20px' }}>보관된 도면이 없습니다.</div> ) : (
              gallery.map((img, idx) => {
                const isCurrent = backgroundUrl === img.url;
                return (
                  <div key={idx} onClick={() => handleApplyFromGallery(img)} style={{ minWidth: '140px', height: '100px', background: '#0f172a', borderRadius: '10px', overflow: 'hidden', position: 'relative', cursor: 'pointer', border: isCurrent ? '3px solid #3b82f6' : '2px solid transparent', transition: 'transform 0.2s' }}>
                    <img src={img.url} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCurrent ? 1 : 0.6 }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '6px', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{img.fileName ? img.fileName.split('_').pop() : '도면'}</div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div ref={mapRef} className="map-container-inner" onMouseDown={handleMapWrapperMouseDown} onMouseMove={handleMapWrapperMouseMove} onMouseUp={handleMapWrapperMouseUp} onMouseLeave={handleMapWrapperMouseUp}
          style={{ position: 'relative', display: 'inline-block', transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.2s ease', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', borderRadius: '12px', minWidth: '1200px', minHeight: '800px' }}>
          
          {backgroundUrl ? <img src={backgroundUrl} alt="floor-plan" draggable="false" style={{ display: 'block', width: '1200px', height: 'auto', borderRadius: '12px', pointerEvents: 'none' }} /> : <div style={{ width: '1200px', height: '800px', background: '#e2e8f0', borderRadius: '12px' }} />}

          {selectionBox && (
            <div style={{ position: 'absolute', zIndex: 9999, pointerEvents: 'none', backgroundColor: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`, top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`, width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`, height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px` }} />
          )}

          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            
            {isEditMode && guides.v.map((centerX, idx) => (<div key={`guide-v-${idx}`} style={{ position: 'absolute', left: `${centerX}px`, top: 0, height: '100%', width: '0', borderLeft: '1.5px dashed #ef4444', zIndex: 99, pointerEvents: 'none' }} />))}
            {isEditMode && guides.h.map((centerY, idx) => (<div key={`guide-h-${idx}`} style={{ position: 'absolute', top: `${centerY}px`, left: 0, width: '100%', height: '0', borderTop: '1.5px dashed #ef4444', zIndex: 99, pointerEvents: 'none' }} />))}

            {mapSeats.map(seat => {
              if (!seatRefs.current[seat.id]) seatRefs.current[seat.id] = createRef();
              if (!seatInnerRefs.current[seat.id]) seatInnerRefs.current[seat.id] = createRef();

              const isSelected = flatSelectedIds.includes(seat.id);

              let seatBg = '#fff'; let borderColor = '#94a3b8'; let textColor = '#1e293b'; let statusText = '';
              if (!isEditMode) {
                if (seat.status === 'RESERVED') { seatBg = '#fef08a'; borderColor = '#eab308'; textColor = '#854d0e'; statusText = isAdmin ? (seat.studentNo || '예약중') : '예약중'; } 
                else if (seat.status === 'OCCUPIED') { seatBg = '#bfdbfe'; borderColor = '#3b82f6'; textColor = '#1e3a8a'; statusText = isAdmin ? (seat.studentNo || '사용중') : '사용중'; } 
                else if (seat.status === 'DISABLED') { seatBg = '#fee2e2'; borderColor = '#ef4444'; textColor = '#b91c1c'; statusText = '비활성화'; }
              }

              const seatW = Number(seat.width ?? 75);
              const seatH = Number(seat.height ?? 65);

              return (
                <Draggable
                  nodeRef={seatRefs.current[seat.id]}
                  key={seat.id}
                  disabled={!isEditMode}
                  position={{ x: Number(seat.x), y: Number(seat.y) }} 
                  scale={zoomLevel} 
                  grid={isEditMode ? [1, 1] : undefined}
                  
                  onStart={(e) => {
                    if (isEditMode) {
                      let currentGroups = [...selectedSeatGroups];
                      let currentFlat = currentGroups.flat();

                      if (e.shiftKey && lastSelectedSeatId.current) {
                        const s1 = mapSeats.find(s => s.id === lastSelectedSeatId.current);
                        const s2 = seat;
                        if (s1 && s2) {
                          const minX = Math.min(s1.x, s2.x); const maxX = Math.max(s1.x + (s1.width ?? 75), s2.x + (s2.width ?? 75));
                          const minY = Math.min(s1.y, s2.y); const maxY = Math.max(s1.y + (s1.height ?? 65), s2.y + (s2.height ?? 65));

                          const inBox = mapSeats.filter(s => {
                            const cx = s.x + (s.width ?? 75)/2; const cy = s.y + (s.height ?? 65)/2;
                            return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
                          }).map(s => s.id);
                          
                          const newBox = inBox.filter(id => !currentFlat.includes(id));
                          if (newBox.length > 0) currentGroups.push(newBox);
                          
                          setSelectedSeatGroups(currentGroups);
                          currentFlat = currentGroups.flat();
                        }
                      } 
                      else if (e.metaKey || e.ctrlKey) {
                        if (currentFlat.includes(seat.id)) {
                          currentGroups = currentGroups.map(g => g.filter(id => id !== seat.id)).filter(g => g.length > 0);
                        } else {
                          if (currentGroups.length > 0) currentGroups[currentGroups.length - 1].push(seat.id);
                          else currentGroups.push([seat.id]);
                        }
                        setSelectedSeatGroups(currentGroups);
                        currentFlat = currentGroups.flat();
                        lastSelectedSeatId.current = seat.id;
                      } 
                      else {
                        if (!currentFlat.includes(seat.id)) {
                          currentGroups = [[seat.id]];
                          setSelectedSeatGroups(currentGroups);
                          currentFlat = [seat.id];
                        }
                        lastSelectedSeatId.current = seat.id;
                      }

                      if (!currentFlat.includes(seat.id)) return false;
                      if (currentFlat.some(id => mapSeats.find(s => s.id === id)?.isLocked)) return false; 
                      
                      seatDragData.current.originals = {};
                      currentFlat.forEach(id => {
                        const s = mapSeats.find(mapSeat => mapSeat.id === id);
                        if (s) seatDragData.current.originals[id] = { x: Number(s.x), y: Number(s.y) };
                      });
                      seatDragData.current.currentFlatIds = currentFlat;
                    }
                  }}

                  onDrag={(e, data) => {
                    if (!isEditMode) return;
                    const SNAP_DIST = 15; 
                    
                    let closestX = null; let minDiffX = SNAP_DIST;
                    let closestY = null; let minDiffY = SNAP_DIST;

                    const myX = Number(data.x); const myY = Number(data.y);
                    const currentCenterX = myX + seatW / 2; const currentCenterY = myY + seatH / 2;

                    const currentFlatIds = seatDragData.current.currentFlatIds || [seat.id];
                    const unselectedSeats = mapSeats.filter(s => !currentFlatIds.includes(s.id));

                    unselectedSeats.forEach(other => {
                      const oW = Number(other.width ?? 75); const oH = Number(other.height ?? 65);
                      const oCX = Number(other.x) + oW / 2; const oCY = Number(other.y) + oH / 2;
                      
                      const diffX = Math.abs(currentCenterX - oCX);
                      if (diffX < minDiffX) { minDiffX = diffX; closestX = oCX; }
                      
                      const diffY = Math.abs(currentCenterY - oCY);
                      if (diffY < minDiffY) { minDiffY = diffY; closestY = oCY; }
                    });

                    setGuides({ v: closestX !== null ? [closestX] : [], h: closestY !== null ? [closestY] : [] });

                    const snapX = closestX !== null ? (closestX - seatW / 2) : myX;
                    const snapY = closestY !== null ? (closestY - seatH / 2) : myY;

                    const primaryOrigX = seatDragData.current.originals[seat.id].x;
                    const primaryOrigY = seatDragData.current.originals[seat.id].y;
                    
                    const rawDeltaX = myX - primaryOrigX; const rawDeltaY = myY - primaryOrigY;
                    const snapOffsetX = snapX - myX; const snapOffsetY = snapY - myY;
                    
                    const totalOffsetX = rawDeltaX + snapOffsetX; const totalOffsetY = rawDeltaY + snapOffsetY;

                    currentFlatIds.forEach(id => {
                      if (seatInnerRefs.current[id]?.current) {
                        seatInnerRefs.current[id].current.style.transform = `translate(${id === seat.id ? snapOffsetX : totalOffsetX}px, ${id === seat.id ? snapOffsetY : totalOffsetY}px)`;
                      }
                    });

                    seatDragData.current.totalOffsetX = totalOffsetX;
                    seatDragData.current.totalOffsetY = totalOffsetY;
                  }}

                  onStop={(e, data) => {
                    if (isEditMode) setGuides({ v: [], h: [] });
                    const currentFlatIds = seatDragData.current.currentFlatIds || [seat.id];
                    const totalOffsetX = seatDragData.current.totalOffsetX || 0;
                    const totalOffsetY = seatDragData.current.totalOffsetY || 0;

                    currentFlatIds.forEach(id => {
                      if (seatInnerRefs.current[id]?.current) seatInnerRefs.current[id].current.style.transform = `translate(0px, 0px)`;
                    });

                    const newPositions = currentFlatIds.map(id => {
                      const orig = seatDragData.current.originals[id];
                      if (!orig) return null;
                      const sData = mapSeats.find(s => s.id === id);
                      return { id, x: Math.round(orig.x + totalOffsetX), y: Math.round(orig.y + totalOffsetY), w: Number(sData.width ?? 75), h: Number(sData.height ?? 65) };
                    }).filter(Boolean);

                    let hasCollision = false;
                    const unselectedSeats = mapSeats.filter(s => !currentFlatIds.includes(s.id));
                    newPositions.forEach(newPos => {
                      unselectedSeats.forEach(other => {
                        const oX = Number(other.x); const oW = Number(other.width ?? 75);
                        const oY = Number(other.y); const oH = Number(other.height ?? 65);
                        if (newPos.x < oX + oW - 1 && newPos.x + newPos.w > oX + 1 && newPos.y < oY + oH - 1 && newPos.y + newPos.h > oY + 1) hasCollision = true;
                      });
                    });

                    if (!hasCollision && (totalOffsetX !== 0 || totalOffsetY !== 0)) {
                      setMapSeats(prev => prev.map(s => {
                        if (currentFlatIds.includes(s.id)) {
                          const pos = newPositions.find(p => p.id === s.id);
                          return { ...s, x: pos.x, y: pos.y };
                        }
                        return s;
                      }));
                      
                      console.log("=== 📍 좌표 이동 완료 ===");
                      newPositions.forEach(pos => {
                        console.log(`🪑 좌석 [${pos.id}] | x: ${pos.x}, y: ${pos.y}`);
                      });
                    }
                    seatDragData.current = {}; 
                  }}
                >
                  <div className="no-pan seat-element" ref={seatRefs.current[seat.id]}
                    onClick={() => { if (!isEditMode && !(seat.status === 'DISABLED' && !isAdmin)) setSelectedSeat(seat); }}
                    style={{ position: 'absolute', width: `${seatW}px`, height: `${seatH}px`, zIndex: isSelected ? 100 : 10 }}>
                    
                    {isEditMode && seat.isLocked && (
                      <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#f59e0b', color: '#fff', fontSize: '0.65rem', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 20 }}>🔒</div>
                    )}

                    <div ref={seatInnerRefs.current[seat.id]}
                      style={{ 
                        width: '100%', height: '100%', 
                        background: isEditMode ? (isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.4)') : seatBg, 
                        borderRadius: '8px', 
                        border: isEditMode ? (isSelected ? '2px solid #2563eb' : '2px dashed #ef4444') : `2px solid ${borderColor}`, 
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
                        cursor: (seat.status === 'DISABLED' && !isAdmin) ? 'not-allowed' : (seat.isLocked ? 'not-allowed' : 'pointer'), 
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                      }}>
                      <span style={{ fontWeight: '900', fontSize: '0.85rem', pointerEvents: 'none', color: isEditMode ? (isSelected ? '#2563eb' : '#fff') : textColor }}>{seat.label}</span>
                      {!isEditMode && statusText && <span style={{ fontSize: '0.65rem', fontWeight: '900', color: textColor, marginTop: '2px', pointerEvents: 'none' }}>{statusText}</span>}
                    </div>
                  </div>
                </Draggable>
              );
            })}
          </div>
        </div>
      </div>

      {/* ✅ 인스펙터 패널: 위치 좌표(X, Y) 실시간 표시 및 직접 입력 기능 추가 */}
      {isEditMode && flatSelectedIds.length > 0 && (
        <Draggable 
          nodeRef={inspectorRef} 
          handle=".panel-drag-handle"
          defaultPosition={inspectorPos.current}
          onStop={(e, data) => {
            inspectorPos.current = { x: data.x, y: data.y };
          }}
        >
          <div ref={inspectorRef} style={{ 
            position: 'fixed', 
            bottom: '30px', 
            left: 'calc(50% - 140px)', 
            background: 'rgba(15, 23, 42, 0.95)', 
            backdropFilter: 'blur(16px)', 
            padding: '16px', 
            borderRadius: '20px', 
            zIndex: 999999, 
            boxShadow: '0 15px 40px rgba(0,0,0,0.5)', 
            width: '280px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px', 
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            
            <div className="panel-drag-handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', cursor: 'grab' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '0.95rem', fontWeight: '900', pointerEvents: 'none' }}>🪑 좌석 편집</h3>
              <span style={{ background: '#3b82f6', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '900', pointerEvents: 'none' }}>
                {flatSelectedIds.length > 1 ? `${flatSelectedIds.length}개 선택됨` : flatSelectedIds[0]}
              </span>
            </div>

            {/* 📍 [신규] 좌표 (X, Y) 및 크기 (W, H) 입력 폼 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* X, Y 좌표 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>X 좌표</label>
                  <input type="number" value={mapSeats.find(s => s.id === flatSelectedIds[0])?.x ?? 0} 
                    onChange={(e) => {
                      if (flatSelectedIds.some(id => mapSeats.find(s => s.id === id)?.isLocked)) { alert("🔒 잠긴 좌석은 좌표를 수정할 수 없습니다."); return; }
                      const val = parseInt(e.target.value, 10) || 0;
                      setMapSeats(prev => prev.map(s => flatSelectedIds.includes(s.id) ? { ...s, x: val } : s));
                    }} 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: '900', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Y 좌표</label>
                  <input type="number" value={mapSeats.find(s => s.id === flatSelectedIds[0])?.y ?? 0} 
                    onChange={(e) => {
                      if (flatSelectedIds.some(id => mapSeats.find(s => s.id === id)?.isLocked)) { alert("🔒 잠긴 좌석은 좌표를 수정할 수 없습니다."); return; }
                      const val = parseInt(e.target.value, 10) || 0;
                      setMapSeats(prev => prev.map(s => flatSelectedIds.includes(s.id) ? { ...s, y: val } : s));
                    }} 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: '900', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              
              {/* W, H 크기 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>가로 (W)</label>
                  <input type="number" value={mapSeats.find(s => s.id === flatSelectedIds[0])?.width ?? 75} 
                    onChange={(e) => {
                      if (flatSelectedIds.some(id => mapSeats.find(s => s.id === id)?.isLocked)) { alert("🔒 잠긴 좌석은 크기를 수정할 수 없습니다."); return; }
                      const val = parseInt(e.target.value, 10) || 0;
                      setMapSeats(prev => prev.map(s => flatSelectedIds.includes(s.id) ? { ...s, width: val } : s));
                    }} 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: '900', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>세로 (H)</label>
                  <input type="number" value={mapSeats.find(s => s.id === flatSelectedIds[0])?.height ?? 65} 
                    onChange={(e) => {
                      if (flatSelectedIds.some(id => mapSeats.find(s => s.id === id)?.isLocked)) { alert("🔒 잠긴 좌석은 크기를 수정할 수 없습니다."); return; }
                      const val = parseInt(e.target.value, 10) || 0;
                      setMapSeats(prev => prev.map(s => flatSelectedIds.includes(s.id) ? { ...s, height: val } : s));
                    }} 
                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: '900', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* 정렬 및 간격 맞춤 버튼 그룹 (클릭 시 파란색 번쩍임 적용) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleAlignTop)} title="위쪽 맞춤" style={{ padding: '8px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>⬆ 위 맞춤</button>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleAlignLeft)} title="왼쪽 맞춤" style={{ padding: '8px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>⬅ 좌 맞춤</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleAlignHorizontalCenter)} title="가로 중앙으로 일렬 배치" style={{ padding: '8px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>🟰 가로 한줄</button>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleAlignVerticalCenter)} title="세로 중앙으로 일렬 배치" style={{ padding: '8px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>⏸ 세로 한줄</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleDistributeHorizontal)} title="좌우 간격 동일" style={{ padding: '8px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>↔ 가로 간격</button>
                <button className="click-flash-btn" onClick={() => checkLockAndRun(handleDistributeVertical)} title="상하 간격 동일" style={{ padding: '8px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>↕ 세로 간격</button>
              </div>

              <button className="click-flash-btn" onClick={handleToggleLock} style={{ width: '100%', padding: '10px', background: isAllLocked ? '#f59e0b' : '#1e293b', color: '#fff', border: isAllLocked ? 'none' : '1px solid #475569', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '2px' }}>
                {isAllLocked ? '🔓 잠금해제' : '🔒 위치잠금'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={() => { if(window.confirm(`선택한 ${flatSelectedIds.length}개의 좌석을 영구 삭제하시겠습니까?`)) { flatSelectedIds.forEach(id => onDeleteSeat(id)); setMapSeats(prev => prev.filter(s => !flatSelectedIds.includes(s.id))); setSelectedSeatGroups([]); } }} style={{ flex: 1, padding: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>🗑 삭제</button>
              <button onClick={() => setSelectedSeatGroups([])} style={{ flex: 1, padding: '10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>✅ 확인</button>
            </div>
          </div>
        </Draggable>
      )}
    </div>
  );
};

export default FloorMap;