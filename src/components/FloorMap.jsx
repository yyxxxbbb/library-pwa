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
  const [selectedEditId, setSelectedEditId] = useState(null);
  const [showToast, setShowToast] = useState(false);

  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [gallery, setGallery] = useState([]); 
  const [showGallery, setShowGallery] = useState(false);

  const [zoomLevel, setZoomLevel] = useState(0.85);

  const seatRefs = useRef({});
  const inspectorRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const scrollRef = useRef(null);
  const dragState = useRef({ isDown: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    if (!seats || !Array.isArray(seats)) return; 
    
    const floorSeats = seats.filter(seat => seat.id.startsWith(activeFloor));
    
    setMapSeats(prev => {
      if (isEditMode) {
        if (prev.length !== floorSeats.length || (prev.length > 0 && !prev[0].id.startsWith(activeFloor))) {
          return floorSeats.map((seat, index) => ({
            ...seat,
            x: seat.x ?? (index % 8) * 100 + 20,
            y: seat.y ?? Math.floor(index / 8) * 100 + 20,
            // 💡 [추가] DB에 사이즈 값이 없으면 기본값 80x70 부여
            width: seat.width ?? 80,
            height: seat.height ?? 70
          }));
        }
        return prev;
      }
      return floorSeats.map((seat, index) => ({
        ...seat,
        x: seat.x ?? (index % 8) * 100 + 20,
        y: seat.y ?? Math.floor(index / 8) * 100 + 20,
        width: seat.width ?? 80,
        height: seat.height ?? 70
      }));
    });

    const unsubBg = onSnapshot(doc(db, 'FloorPlans', activeFloor), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBackgroundUrl(data.url);
        if (data.history) setGallery(data.history);
        else setGallery([]);
      } else {
        setBackgroundUrl("");
        setGallery([]);
      }
    });

    return () => unsubBg();
  }, [seats, activeFloor, isEditMode]);

  const updateSeatData = (id, field, value) => {
    setMapSeats(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: field === 'label' ? value : parseInt(value, 10) || 0 } : s
    ));
  };

  const handleSave = async () => {
    try {
      await onUpdateSeats(mapSeats);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (e) {
      alert("저장 실패!");
    }
  };

  const handleFloorPlanUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const fileName = `${Date.now()}_${file.name}`;
    const storagePath = `floor_plans/${activeFloor}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      }, 
      (error) => {
        setIsUploading(false);
        alert("업로드 실패: Storage 권한을 확인하세요.");
      }, 
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newImageObj = { url: downloadURL, fileName: fileName, uploadedAt: Date.now() };

          await setDoc(doc(db, 'FloorPlans', activeFloor), {
            url: downloadURL,
            lastUpdated: new Date(),
            fileName: fileName,
            history: arrayUnion(newImageObj)
          }, { merge: true }); 

          setIsUploading(false); 
          alert(`${activeFloor} 도면이 업로드 및 보관함에 추가되었습니다.`);
        } catch (err) {
          setIsUploading(false); 
          alert(`DB 저장에 실패했습니다.\n사유: ${err.message}`);
        }
      }
    );
  };

  const handleApplyFromGallery = async (imgObj) => {
    try {
      await setDoc(doc(db, 'FloorPlans', activeFloor), {
        url: imgObj.url,
        fileName: imgObj.fileName,
        lastUpdated: new Date()
      }, { merge: true });
      setShowGallery(false);
      alert('선택한 도면으로 변경되었습니다!');
    } catch (err) {
      alert('도면 변경 실패!');
    }
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.no-pan')) return; 
    const map = scrollRef.current;
    dragState.current.isDown = true;
    map.style.cursor = 'grabbing';
    dragState.current.startX = e.pageX - map.offsetLeft;
    dragState.current.startY = e.pageY - map.offsetTop;
    dragState.current.scrollLeft = map.scrollLeft;
    dragState.current.scrollTop = map.scrollTop;
  };

  const handleMouseLeave = () => {
    dragState.current.isDown = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  const handleMouseUp = () => {
    dragState.current.isDown = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  const handleMouseMove = (e) => {
    if (!dragState.current.isDown) return;
    e.preventDefault();
    const map = scrollRef.current;
    const x = e.pageX - map.offsetLeft;
    const y = e.pageY - map.offsetTop;
    const walkX = (x - dragState.current.startX) * 1.5; 
    const walkY = (y - dragState.current.startY) * 1.5;
    map.scrollLeft = dragState.current.scrollLeft - walkX;
    map.scrollTop = dragState.current.scrollTop - walkY;
  };

  const currentEditSeat = mapSeats.find(s => s.id === selectedEditId);

  return (
    <div style={{ marginBottom: '40px', background: '#fff', padding: '25px 30px', borderRadius: '20px', boxShadow: '0 5px 20px rgba(0,0,0,0.05)', position: 'relative' }}>
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {isUploading && (
        <div className="no-pan" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(30,41,59,0.9)', zIndex: 10002, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '20px' }}>
          <div style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', marginBottom: '15px' }}>🚀 도면 전송 중... {uploadProgress}%</div>
          <div style={{ width: '60%', height: '8px', background: '#475569', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      <div className="no-pan" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '15px 30px', background: 'rgba(16, 185, 129, 0.95)', color: '#fff', borderRadius: '50px', fontWeight: '900', fontSize: '1.1rem', zIndex: 10001, pointerEvents: 'none', transition: 'opacity 0.5s ease', opacity: showToast ? 1 : 0, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>✅ 저장이 완료되었습니다!</div>

      <div className="no-pan" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <h2 style={{ color: '#111', fontSize: '1.6rem', borderLeft: '6px solid #0056b3', paddingLeft: '15px', margin: 0, fontWeight: '900' }}>{title}</h2>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditMode && (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFloorPlanUpload} style={{ display: 'none' }} />
                <button onClick={() => setShowGallery(!showGallery)} style={{ padding: '8px 16px', background: showGallery ? '#2563eb' : '#334155', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>📂 도면 보관함</button>
                <button onClick={() => fileInputRef.current.click()} style={{ padding: '8px 16px', background: '#334155', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>🖼️ 새 도면 업로드</button>
              </>
            )}
            <button onClick={() => { setIsEditMode(!isEditMode); setSelectedEditId(null); setShowGallery(false); }} 
              style={{ padding: '8px 16px', background: isEditMode ? '#ef4444' : '#475569', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              {isEditMode ? "✖ 편집 종료" : "⚙ 도면 편집"}
            </button>
          </div>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="hide-scroll"
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        style={{ 
          width: '100%', height: '65vh', minHeight: '500px', overflow: 'auto', 
          background: isEditMode ? '#f1f5f9' : '#f8fafc', border: isEditMode ? '2px dashed #94a3b8' : 'none', 
          borderRadius: '12px', position: 'relative', WebkitOverflowScrolling: 'touch',
          cursor: 'grab' 
        }}>
        
        <div className="no-pan" style={{ position: 'sticky', top: '100%', left: '100%', transform: 'translate(-20px, -90px)', width: '0', height: '0', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.15, 1.3))} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>+</button>
          <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.15, 0.55))} style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#334155' }}>-</button>
        </div>

        {isEditMode && showGallery && (
          <div className="no-pan" style={{ position: 'sticky', top: '15px', left: '15px', right: '15px', background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '15px', padding: '20px', zIndex: 10000, border: '1px solid #475569', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'flex', gap: '15px', overflowX: 'auto', margin: '15px' }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px' }}>
              <button onClick={() => setShowGallery(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer' }}>✖</button>
            </div>
            {gallery.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '20px' }}>아직 보관된 도면이 없습니다.</div>
            ) : (
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

        <div style={{
          position: 'relative', width: '1000px', height: '1300px', margin: '0 auto',
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none', 
          backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center top',
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top center',
          transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' 
        }}>
          {mapSeats.map(seat => {
            if (!seatRefs.current[seat.id]) seatRefs.current[seat.id] = createRef();
            const isSelected = selectedEditId === seat.id;

            return (
              <Draggable
                nodeRef={seatRefs.current[seat.id]}
                key={seat.id}
                disabled={!isEditMode}
                position={{ x: seat.x, y: seat.y }}
                bounds="parent" 
                scale={zoomLevel} 
                onDrag={(e, data) => {
                  updateSeatData(seat.id, 'x', data.x);
                  updateSeatData(seat.id, 'y', data.y);
                }}
              >
                <div 
                  className="no-pan"
                  ref={seatRefs.current[seat.id]}
                  onClick={() => isEditMode ? setSelectedEditId(seat.id) : setSelectedSeat(seat)}
                  // 💡 [변경] 이제 width와 height를 seat 데이터에서 읽어옵니다!
                  style={{ position: 'absolute', width: `${seat.width ?? 80}px`, height: `${seat.height ?? 70}px`, zIndex: isSelected ? 100 : 10 }}>
                  <div style={{ width: '100%', height: '100%', background: isEditMode ? 'rgba(255,255,255,0.85)' : '#fff', borderRadius: '12px', border: isSelected ? '4px solid #2563eb' : '2px solid #94a3b8', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', boxShadow: isSelected ? '0 10px 25px rgba(37, 99, 235, 0.4)' : '0 2px 5px rgba(0,0,0,0.05)', transform: isSelected ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', backdropFilter: isEditMode ? 'blur(4px)' : 'none' }}>
                    <span style={{ fontWeight: '900', fontSize: '0.9rem', pointerEvents: 'none', color: '#1e293b' }}>{seat.label}</span>
                  </div>
                </div>
              </Draggable>
            );
          })}
        </div>
      </div>

      {isEditMode && currentEditSeat && (
        <Draggable nodeRef={inspectorRef} handle=".handle">
          <div className="no-pan" ref={inspectorRef} style={{ position: 'fixed', bottom: '40px', left: '40px', width: '280px', background: '#1e293b', color: '#fff', padding: '0', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', zIndex: 10001, border: '1px solid #334155', overflow: 'hidden' }}>
            <div className="handle" style={{ padding: '12px 20px', background: '#334155', cursor: 'grab', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '900', color: '#94a3b8' }}>좌석 에디터 (핸들)</span>
              <button onClick={() => setSelectedEditId(null)} style={{ position: 'absolute', right: '15px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>이름 수정</label>
                <input type="text" value={currentEditSeat.label} onChange={(e) => updateSeatData(selectedEditId, 'label', e.target.value)} style={{ width: '100%', background: '#334155', border: '1px solid #475569', color: '#fff', padding: '10px', borderRadius: '8px', boxSizing: 'border-box', fontWeight: 'bold' }} />
              </div>
              
              {/* 💡 [추가] 좌표(X,Y) 패널 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>X 좌표</label>
                  <input type="number" value={currentEditSeat.x} onChange={(e) => updateSeatData(selectedEditId, 'x', e.target.value)} style={{ width: '100%', background: '#334155', border: 'none', color: '#fff', padding: '10px 5px', borderRadius: '8px', textAlign: 'center', fontWeight: '900' }} />
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Y 좌표</label>
                  <input type="number" value={currentEditSeat.y} onChange={(e) => updateSeatData(selectedEditId, 'y', e.target.value)} style={{ width: '100%', background: '#334155', border: 'none', color: '#fff', padding: '10px 5px', borderRadius: '8px', textAlign: 'center', fontWeight: '900' }} />
                </div>
              </div>

              {/* 💡 [추가] 사이즈(W,H) 패널 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>가로 (W)</label>
                  <input type="number" value={currentEditSeat.width ?? 80} onChange={(e) => updateSeatData(selectedEditId, 'width', e.target.value)} style={{ width: '100%', background: '#334155', border: 'none', color: '#fff', padding: '10px 5px', borderRadius: '8px', textAlign: 'center', fontWeight: '900' }} />
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>세로 (H)</label>
                  <input type="number" value={currentEditSeat.height ?? 70} onChange={(e) => updateSeatData(selectedEditId, 'height', e.target.value)} style={{ width: '100%', background: '#334155', border: 'none', color: '#fff', padding: '10px 5px', borderRadius: '8px', textAlign: 'center', fontWeight: '900' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { if(window.confirm('삭제하시겠습니까?')) { onDeleteSeat(selectedEditId); setMapSeats(prev => prev.filter(s => s.id !== selectedEditId)); setSelectedEditId(null); } }} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>삭제</button>
                <button onClick={handleSave} style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>저장</button>
              </div>
            </div>
          </div>
        </Draggable>
      )}
    </div>
  );
};

export default FloorMap;