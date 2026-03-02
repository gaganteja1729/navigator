import { useState, useEffect, useRef, useCallback } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import {
    loadSegments, saveSegments, addSegment,
    deleteSegment, exportToJson, importFromJson,
} from '../utils/walkablePaths.js';
import '../styles/AdminPath.css';

// ── Predefined campus locations ───────────────────────────────────
const CAMPUS_LOCATIONS = [
    { name: 'Canteen', lat: 17.38520, lng: 78.48670 },
    { name: 'Main Gate', lat: 17.38480, lng: 78.48640 },
    { name: 'Dot Net Lab', lat: 17.38510, lng: 78.48690 },
    { name: 'Main Block', lat: 17.38530, lng: 78.48660 },
    { name: 'Drinking Water', lat: 17.38505, lng: 78.48655 },
    { name: 'Compute Block', lat: 17.38540, lng: 78.48680 },
    { name: 'CME 1st Year', lat: 17.38495, lng: 78.48700 },
    { name: 'CME 3rd Year', lat: 17.38550, lng: 78.48710 },
    { name: 'Playground', lat: 17.38460, lng: 78.48620 },
];

// ── localStorage helpers for saved location coords ────────────────
const LOC_STORAGE_KEY = 'campus_loc_coords';

function loadLocCoords() {
    try { return JSON.parse(localStorage.getItem(LOC_STORAGE_KEY) || '{}'); }
    catch { return {}; }
}

function saveLocCoords(map) {
    localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(map));
}














// ── SVG canvas size ──────────────────────────────────────────────
const W = 380, H = 460;

// ── Map scale: how many metres the full SVG width/height spans ──
// Increase to zoom out, decrease to zoom in.
const SPAN_M = 80; // 80 metres across

// ── Convert metres offset → degrees (approx) ────────────────────
const M_PER_LAT = 111320;
const mPerLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

/**
 * Build a GPS-centred projection for the SVG.
 * Returns { project(lat,lng)→{x,y},  unproject(x,y)→{lat,lng} }
 */
function makeProjection(centerLat, centerLng) {
    const halfLatDeg = (SPAN_M / 2) / M_PER_LAT;
    const halfLngDeg = (SPAN_M / 2) / mPerLng(centerLat);
    const PAD = 30;
    const usableW = W - PAD * 2;
    const usableH = H - PAD * 2;

    const project = (lat, lng) => ({
        x: ((lng - (centerLng - halfLngDeg)) / (2 * halfLngDeg)) * usableW + PAD,
        y: (((centerLat + halfLatDeg) - lat) / (2 * halfLatDeg)) * usableH + PAD,
    });

    const unproject = (x, y) => ({
        lat: (centerLat + halfLatDeg) - ((y - PAD) / usableH) * (2 * halfLatDeg),
        lng: (centerLng - halfLngDeg) + ((x - PAD) / usableW) * (2 * halfLngDeg),
    });

    return { project, unproject };
}

const FLOORS = ['ground', 'first'];

// ── Label input modal ────────────────────────────────────────────
function LabelModal({ pointType, defaultVal, onConfirm, onSkip }) {
    const [val, setVal] = useState(defaultVal || '');
    return (
        <div className="ap-modal-overlay">
            <div className="ap-modal">
                <p className="ap-modal-title">
                    {pointType === 'start' ? '📍 Start' : '🏁 End'} point label
                </p>
                <input
                    className="ap-modal-input"
                    placeholder="e.g. Room 101 door, Staircase top…"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    autoFocus
                />
                <div className="ap-modal-row">
                    <button className="ap-modal-skip" onClick={onSkip}>Skip</button>
                    <button className="ap-modal-ok" onClick={() => onConfirm(val)}>OK</button>
                </div>
            </div>
        </div>
    );
}

export default function AdminPathScreen() {
    const { gpsPos, gpsError, goBack, refreshGraph } = useNav();

    const [floor, setFloor] = useState('ground');
    const [segments, setSegments] = useState([]);
    const [showList, setShowList] = useState(false);

    // Drop state machine: null | 'needStart' | 'needEnd'
    const [dropMode, setDropMode] = useState(null);
    const [pendingStart, setPendingStart] = useState(null);   // {lat,lng,label}

    // Undo stack — each entry is a snapshot of { pendingStart, lastSegId }
    // lastSegId is set when an end-point was dropped and a segment was saved.
    const [undoStack, setUndoStack] = useState([]);  // array of { pendingStart, savedSegId }

    // Modal
    const [modal, setModal] = useState(null);  // { type:'start'|'end', lat, lng, x, y }

    // ── Mock / pinned location ────────────────────────────────────
    const [mockLocation, setMockLocation] = useState(null);  // { name, lat, lng } | null
    const [showLocPicker, setShowLocPicker] = useState(false);

    // Saved GPS overrides per location name (persisted in localStorage)
    const [savedLocCoords, setSavedLocCoords] = useState(() => loadLocCoords());

    // Effective GPS:
    //   1. If a campus location is selected AND it has saved GPS coords → use saved coords
    //   2. If a campus location is selected but no saved coords → use its default lat/lng
    //   3. Otherwise → use real GPS
    const effectiveGps = mockLocation
        ? savedLocCoords[mockLocation.name]
            ? { ...savedLocCoords[mockLocation.name], accuracy: 1 }
            : { lat: mockLocation.lat, lng: mockLocation.lng, accuracy: 1 }
        : gpsPos;

    const [status, setStatus] = useState('Tap "Draw Path" then tap two points on the map.');
    const svgRef = useRef(null);
    const importRef = useRef(null);

    // ── GPS centre for the map ───────────────────────────────────
    // Use effective GPS (mock override or real) if available; fall back to neutral centre
    const [mapCenter, setMapCenter] = useState({ lat: 17.38515, lng: 78.48665 });
    useEffect(() => {
        if (effectiveGps) setMapCenter({ lat: effectiveGps.lat, lng: effectiveGps.lng });
    }, [effectiveGps]);

    const proj = makeProjection(mapCenter.lat, mapCenter.lng);

    // ── Load segments on mount ───────────────────────────────────
    useEffect(() => { setSegments(loadSegments()); }, []);

    const floorSegs = segments.filter(s => s.floor === floor);

    // ── Recenter map to GPS ──────────────────────────────────────
    const recenter = () => {
        if (effectiveGps) { setMapCenter({ lat: effectiveGps.lat, lng: effectiveGps.lng }); setStatus(mockLocation ? `Map recentred to ${mockLocation.name}.` : 'Map recentred to your GPS location.'); }
        else setStatus('⚠️ GPS not available yet.');
    };

    // ── Campus location picker ───────────────────────────────────
    const handleSelectLocation = (loc) => {
        // Use saved coords if they exist, otherwise default placeholder
        const saved = savedLocCoords[loc.name];
        const pinLat = saved ? saved.lat : loc.lat;
        const pinLng = saved ? saved.lng : loc.lng;
        setMockLocation(loc);
        setShowLocPicker(false);
        setMapCenter({ lat: pinLat, lng: pinLng });
        setStatus(saved
            ? `📌 ${loc.name} — using saved GPS (${pinLat.toFixed(5)}, ${pinLng.toFixed(5)})`
            : `📌 Location pinned to: ${loc.name} (placeholder coords)`);
    };

    const handleClearMock = () => {
        setMockLocation(null);
        setShowLocPicker(false);
        setStatus('Location unpinned — using real GPS.');
    };

    // ── Save real GPS as selected location's coordinates ──────────
    const handleSaveLocation = () => {
        if (!mockLocation) return;
        if (!gpsPos) { setStatus('⚠️ Real GPS not available — move outside and try again.'); return; }
        const updated = { ...savedLocCoords, [mockLocation.name]: { lat: gpsPos.lat, lng: gpsPos.lng } };
        saveLocCoords(updated);
        setSavedLocCoords(updated);
        // Also update the pinned location coords instantly
        setMockLocation(prev => ({ ...prev, lat: gpsPos.lat, lng: gpsPos.lng }));
        setMapCenter({ lat: gpsPos.lat, lng: gpsPos.lng });
        setStatus(`✅ Saved! ${mockLocation.name} → (${gpsPos.lat.toFixed(6)}, ${gpsPos.lng.toFixed(6)})`);
    };

    // ── Delete saved GPS for selected location ────────────────────
    const handleDeleteLocationCoords = () => {
        if (!mockLocation) return;
        const updated = { ...savedLocCoords };
        delete updated[mockLocation.name];
        saveLocCoords(updated);
        setSavedLocCoords(updated);
        // Revert pin to placeholder coords
        const base = CAMPUS_LOCATIONS.find(l => l.name === mockLocation.name);
        if (base) { setMockLocation(base); setMapCenter({ lat: base.lat, lng: base.lng }); }
        setStatus(`🗑 Deleted saved GPS for ${mockLocation.name}. Using placeholder coords.`);
    };












    // ── SVG click handler ────────────────────────────────────────
    const handleSvgClick = useCallback((e) => {
        if (!dropMode) return;
        const svgEl = svgRef.current;
        if (!svgEl) return;

        // Convert DOM click → SVG coordinate
        const rect = svgEl.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        const svgX = (e.clientX - rect.left) * scaleX;
        const svgY = (e.clientY - rect.top) * scaleY;
        const { lat, lng } = proj.unproject(svgX, svgY);

        if (dropMode === 'needStart') {
            setModal({ type: 'start', lat, lng, x: svgX, y: svgY });
        } else if (dropMode === 'needEnd') {
            setModal({ type: 'end', lat, lng, x: svgX, y: svgY });
        }
    }, [dropMode, proj]);

    // ── Modal confirm ─────────────────────────────────────────────
    const handleModalConfirm = (label) => {
        if (modal.type === 'start') {
            const newStart = { lat: modal.lat, lng: modal.lng, x: modal.x, y: modal.y, label: label || 'Point' };
            // Push undo entry (no segment saved yet for start)
            setUndoStack(s => [...s, { pendingStart: null, savedSegId: null }]);
            setPendingStart(newStart);
            setDropMode('needEnd');
            setStatus('📍 Start dropped. Now tap or press "Drop Here" for the end point.');
        } else {
            // Save segment
            const segId = `seg-${Date.now()}`;
            const seg = {
                id: segId,
                floor,
                start: { lat: pendingStart.lat, lng: pendingStart.lng, label: pendingStart.label },
                end: { lat: modal.lat, lng: modal.lng, label: label || 'Point' },
            };
            const updated = addSegment(seg);
            setSegments(updated);
            refreshGraph(updated);
            // Push undo entry BEFORE updating pendingStart
            setUndoStack(s => [...s, { pendingStart: { ...pendingStart }, savedSegId: segId }]);
            // Auto-chain: end becomes new start
            setPendingStart({ lat: modal.lat, lng: modal.lng, x: modal.x, y: modal.y, label: label || 'Point' });
            setDropMode('needEnd');
            setStatus('✅ Segment saved! Drop next end, or press ✓ Done.');
        }
        setModal(null);
    };

    const handleModalSkip = () => { handleModalConfirm(''); };

    // ── Drop point at current GPS position (button shortcut) ──────
    const handleDropHere = () => {
        if (!effectiveGps) { setStatus('⚠️ No GPS fix yet — try later.'); return; }
        const p = proj.project(effectiveGps.lat, effectiveGps.lng);
        setModal({ type: dropMode === 'needStart' ? 'start' : 'end', lat: effectiveGps.lat, lng: effectiveGps.lng, x: p.x, y: p.y });
    };

    // ── Undo last dropped point ───────────────────────────────────
    const handleUndo = () => {
        if (undoStack.length === 0) {
            setStatus('Nothing to undo.');
            return;
        }
        const prev = undoStack[undoStack.length - 1];
        setUndoStack(s => s.slice(0, -1));

        // Remove the saved segment if there was one
        if (prev.savedSegId) {
            const updated = deleteSegment(prev.savedSegId);
            setSegments(updated);
            refreshGraph(updated);
        }

        // Restore pendingStart state
        if (prev.pendingStart === null) {
            // We were at the very first drop (start), go back to needStart
            setPendingStart(null);
            setDropMode('needStart');
            setStatus('↩ Undone. Tap the map to drop the start point again.');
        } else {
            // Restore previous pendingStart and stay in needEnd mode
            setPendingStart(prev.pendingStart);
            setDropMode('needEnd');
            setStatus('↩ Undone. Last segment removed. Drop the end point again.');
        }
    };

    // ── Done / Cancel ─────────────────────────────────────────────
    const handleDone = () => {
        setDropMode(null);
        setPendingStart(null);
        setUndoStack([]);
        setStatus('Path recording finished.');
    };

    // ── Delete segment ───────────────────────────────────────────
    const handleDelete = (id) => {
        const updated = deleteSegment(id);
        setSegments(updated);
        refreshGraph(updated);
    };

    // ── Clear all segments ───────────────────────────────────────
    const handleClearAll = () => {
        if (!window.confirm('Delete ALL recorded paths?')) return;
        saveSegments([]);
        setSegments([]);
        refreshGraph([]);
        setStatus('All paths cleared.');
    };

    // ── Import JSON ──────────────────────────────────────────────
    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const updated = importFromJson(ev.target.result);
                setSegments(updated);
                refreshGraph(updated);
                setStatus('✅ Paths imported!');
            } catch (_) {
                setStatus('❌ Invalid JSON file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // ── GPS user dot ─────────────────────────────────────────────
    const gpsDot = effectiveGps ? proj.project(effectiveGps.lat, effectiveGps.lng) : null;

    return (
        <div className="ap-root">
            {/* Label modal */}
            {modal && (
                <LabelModal
                    pointType={modal.type}
                    defaultVal=""
                    onConfirm={handleModalConfirm}
                    onSkip={handleModalSkip}
                />
            )}

            {/* ── Header ── */}
            <div className="ap-header">
                <button className="ap-back" onClick={goBack}>‹ Back</button>
                <h1 className="ap-title">🛠️ Path Recorder</h1>
                <div className="ap-tools">
                    <button className="ap-tool-btn" onClick={() => exportToJson(segments)} title="Export">⬇</button>
                    <button className="ap-tool-btn" onClick={() => importRef.current.click()} title="Import">⬆</button>
                    <button className="ap-tool-btn danger" onClick={handleClearAll} title="Clear all">🗑</button>
                    <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                </div>
            </div>

            {/* ── Floor tabs ── */}
            <div className="ap-tabs">
                {FLOORS.map(f => (
                    <button key={f} className={`ap-tab ${floor === f ? 'active' : ''}`} onClick={() => setFloor(f)}>
                        {f === 'ground' ? '🏠 Ground' : '🏢 1st Floor'}
                    </button>
                ))}
            </div>

            {/* ── GPS row ── */}
            <div className="ap-gps-row">
                <span className={`ap-gps-badge ${effectiveGps ? 'ok' : 'bad'}`}>
                    {mockLocation
                        ? `📌 ${mockLocation.name} (${mockLocation.lat.toFixed(5)}, ${mockLocation.lng.toFixed(5)})`
                        : effectiveGps
                            ? `📍 ${effectiveGps.lat.toFixed(6)}, ${effectiveGps.lng.toFixed(6)}  ±${Math.round(effectiveGps.accuracy)}m`
                            : gpsError ? `⚠️ ${gpsError}` : '⏳ Acquiring GPS…'}
                </span>
                <button className="ap-recenter-btn" onClick={recenter}>⊕ Centre</button>
            </div>

            {/* ── Location Picker row ── */}
            <div className="ap-loc-row">
                <div className="ap-loc-picker-wrap">
                    {/* Dropdown toggle */}
                    <button
                        className={`ap-loc-btn ${mockLocation ? 'active' : ''}`}
                        onClick={() => setShowLocPicker(v => !v)}
                    >
                        🏫 {mockLocation ? mockLocation.name : 'Set Location'} ▾
                    </button>

                    {/* Save real GPS as this location's coords */}
                    {mockLocation && (
                        <button
                            className="ap-loc-save"
                            onClick={handleSaveLocation}
                            disabled={!gpsPos}
                            title={gpsPos ? 'Save real GPS as this location' : 'No real GPS available'}
                        >
                            💾 Save
                        </button>
                    )}

                    {/* Delete saved GPS coords for this location */}
                    {mockLocation && savedLocCoords[mockLocation.name] && (
                        <button
                            className="ap-loc-delete"
                            onClick={handleDeleteLocationCoords}
                            title="Delete saved GPS for this location"
                        >
                            🗑 Delete
                        </button>
                    )}

                    {/* Unpin / clear selection */}
                    {mockLocation && (
                        <button className="ap-loc-clear" onClick={handleClearMock} title="Unpin location">
                            ✕
                        </button>
                    )}

                    {/* Dropdown list */}
                    {showLocPicker && (
                        <div className="ap-loc-dropdown">
                            {CAMPUS_LOCATIONS.map(loc => (
                                <button
                                    key={loc.name}
                                    className={`ap-loc-option ${mockLocation?.name === loc.name ? 'selected' : ''}`}
                                    onClick={() => handleSelectLocation(loc)}
                                >
                                    {savedLocCoords[loc.name] ? '📍' : '○'} {loc.name}
                                    {savedLocCoords[loc.name] && <span className="ap-loc-saved-badge">GPS saved</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Status bar ── */}
            <div className={`ap-status ${dropMode ? 'active-mode' : ''}`}>
                {dropMode === 'needStart' && <span className="ap-dot green" />}
                {dropMode === 'needEnd' && <span className="ap-dot amber" />}
                {status}
            </div>

            {/* ── SVG map ── */}
            <div className="ap-map-wrap">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className={`ap-svg ${dropMode ? 'crosshair' : ''}`}
                    onClick={handleSvgClick}
                >
                    {/* Background */}
                    <rect width={W} height={H} fill="#09101e" rx="12" />

                    {/* Grid */}
                    {Array.from({ length: 9 }).map((_, i) => {
                        const x = 30 + (i + 1) * ((W - 60) / 10);
                        const y = 30 + (i + 1) * ((H - 60) / 10);
                        return (
                            <g key={i} opacity="0.08">
                                <line x1={x} y1={30} x2={x} y2={H - 30} stroke="#6366f1" strokeWidth="0.5" />
                                <line x1={30} y1={y} x2={W - 30} y2={y} stroke="#6366f1" strokeWidth="0.5" />
                            </g>
                        );
                    })}

                    {/* Floor outline */}
                    <rect x="30" y="30" width={W - 60} height={H - 60}
                        fill="none" stroke="#1e2540" strokeWidth="1.5" rx="6" />

                    {/* Compass rose (top-right corner) */}
                    <text x={W - 36} y={46} textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="bold">N</text>
                    <line x1={W - 36} y1={50} x2={W - 36} y2={62} stroke="#6366f1" strokeWidth="1.5" />

                    {/* Scale hint */}
                    <text x={32} y={H - 18} fill="#334" fontSize="8" fontFamily="monospace">
                        {SPAN_M}m span
                    </text>

                    {/* ── Saved segments ── */}
                    {floorSegs.map((seg, i) => {
                        const s = proj.project(seg.start.lat, seg.start.lng);
                        const e = proj.project(seg.end.lat, seg.end.lng);
                        const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2;
                        return (
                            <g key={seg.id}>
                                {/* Line */}
                                <line x1={s.x} y1={s.y} x2={e.x} y2={e.y}
                                    stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
                                {/* Direction arrow at midpoint */}
                                <circle cx={mx} cy={my} r="3" fill="#818cf8" />
                                {/* Start dot */}
                                <circle cx={s.x} cy={s.y} r="5" fill="#10b981" stroke="#0d1a0f" strokeWidth="1" />
                                {/* End dot */}
                                <circle cx={e.x} cy={e.y} r="5" fill="#f59e0b" stroke="#1a1300" strokeWidth="1" />
                                {/* Labels */}
                                <text x={s.x} y={s.y - 7} textAnchor="middle" fill="#6ee7b7" fontSize="7" fontFamily="Inter">
                                    {seg.start.label}
                                </text>
                                <text x={e.x} y={e.y - 7} textAnchor="middle" fill="#fcd34d" fontSize="7" fontFamily="Inter">
                                    {seg.end.label}
                                </text>
                                {/* Index badge */}
                                <text x={mx + 4} y={my - 4} fill="#5566aa" fontSize="7" fontFamily="Inter">
                                    #{i + 1}
                                </text>
                            </g>
                        );
                    })}

                    {/* ── Saved campus location markers ── */}
                    {CAMPUS_LOCATIONS.map(loc => {
                        const saved = savedLocCoords[loc.name];
                        if (!saved) return null;
                        const p = proj.project(saved.lat, saved.lng);
                        const isActive = mockLocation?.name === loc.name;
                        const pinColor = isActive ? '#f59e0b' : '#fb923c';
                        const textColor = isActive ? '#fde68a' : '#fed7aa';
                        const r = isActive ? 7 : 5;
                        // Abbreviate name to fit on map
                        const shortName = loc.name.length > 10 ? loc.name.slice(0, 9) + '…' : loc.name;
                        return (
                            <g key={loc.name}>
                                {/* Outer pulse ring for active */}
                                {isActive && (
                                    <circle cx={p.x} cy={p.y} r="13" fill="rgba(245,158,11,.18)" className="ap-pulse-ring" />
                                )}
                                {/* Diamond pin */}
                                <rect
                                    x={p.x - r} y={p.y - r}
                                    width={r * 2} height={r * 2}
                                    fill={pinColor}
                                    stroke={isActive ? 'white' : '#1a0a00'}
                                    strokeWidth={isActive ? 1.5 : 1}
                                    transform={`rotate(45 ${p.x} ${p.y})`}
                                />
                                {/* Label */}
                                <text
                                    x={p.x} y={p.y - r - 5}
                                    textAnchor="middle"
                                    fill={textColor}
                                    fontSize={isActive ? 8 : 7}
                                    fontWeight={isActive ? 'bold' : 'normal'}
                                    fontFamily="Inter"
                                >
                                    {shortName}
                                </text>
                            </g>
                        );
                    })}

                    {/* ── Pending start point ── */}
                    {pendingStart && (() => {
                        const p = proj.project(pendingStart.lat, pendingStart.lng);
                        return (
                            <g>
                                <circle cx={p.x} cy={p.y} r="10" fill="rgba(16,185,129,.2)" className="ap-pulse-ring" />
                                <circle cx={p.x} cy={p.y} r="6" fill="#10b981" stroke="white" strokeWidth="1.5" />
                                <text x={p.x} y={p.y - 12} textAnchor="middle" fill="#6ee7b7" fontSize="8" fontWeight="bold">
                                    START
                                </text>
                            </g>
                        );
                    })()}

                    {/* ── Live GPS dot ── */}
                    {gpsDot && (
                        <g>
                            <circle cx={gpsDot.x} cy={gpsDot.y} r="10" fill="rgba(99,102,241,.2)" className="ap-pulse-ring" />
                            <circle cx={gpsDot.x} cy={gpsDot.y} r="5" fill="#818cf8" stroke="white" strokeWidth="1.5" />
                            <circle cx={gpsDot.x} cy={gpsDot.y} r="2" fill="white" />
                        </g>
                    )}

                    {/* ── Tap-hint overlay when dropMode active ── */}
                    {dropMode && (
                        <text x={W / 2} y={H - 14} textAnchor="middle"
                            fill="#6366f1" fontSize="10" fontFamily="Inter" opacity="0.7">
                            {dropMode === 'needStart' ? 'Tap to place START point' : 'Tap to place END point'}
                        </text>
                    )}
                </svg>
            </div>

            {/* ── Action buttons ── */}
            {!dropMode ? (
                <div className="ap-actions">
                    <button className="ap-btn start" onClick={() => { setDropMode('needStart'); setPendingStart(null); setUndoStack([]); setStatus('Tap the map — or press "Drop Here" — to place the START point.'); }}>
                        ✏️ Draw Path
                    </button>
                </div>
            ) : (
                <>
                    {/* Row 1: Drop Here + Undo */}
                    <div className="ap-actions">
                        <button className="ap-btn drop-here" onClick={handleDropHere} disabled={!effectiveGps}>
                            📍 Drop Here
                        </button>
                        <button className="ap-btn undo" onClick={handleUndo} disabled={undoStack.length === 0}>
                            ↩ Undo
                        </button>
                    </div>
                    {/* Row 2: Done + Cancel */}
                    <div className="ap-actions">
                        {dropMode === 'needEnd' && (
                            <button className="ap-btn done" onClick={handleDone}>✓ Done</button>
                        )}
                        <button className="ap-btn cancel" onClick={() => { setDropMode(null); setPendingStart(null); setUndoStack([]); setStatus('Cancelled.'); }}>
                            ✕ Cancel
                        </button>
                    </div>
                </>
            )}

            {/* ── Segment list ── */}
            <div className="ap-list-header" onClick={() => setShowList(v => !v)}>
                <span>📋 Segments on this floor ({floorSegs.length})</span>
                <span className="ap-chevron">{showList ? '▲' : '▼'}</span>
            </div>

            {showList && (
                <div className="ap-seg-list">
                    {floorSegs.length === 0 && (
                        <p className="ap-empty">No segments yet. Tap "Draw Path" to start.</p>
                    )}
                    {floorSegs.map((seg, i) => (
                        <div key={seg.id} className="ap-seg-row">
                            <div className="ap-seg-num">#{i + 1}</div>
                            <div className="ap-seg-info">
                                <span className="ap-seg-from">{seg.start.label || '—'}</span>
                                <span className="ap-seg-arrow"> → </span>
                                <span className="ap-seg-to">{seg.end.label || '—'}</span>
                                <span className="ap-seg-coords">
                                    ({seg.start.lat.toFixed(5)}, {seg.start.lng.toFixed(5)}) →
                                    ({seg.end.lat.toFixed(5)}, {seg.end.lng.toFixed(5)})
                                </span>
                            </div>
                            <button className="ap-del-btn" onClick={() => handleDelete(seg.id)}>🗑</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}