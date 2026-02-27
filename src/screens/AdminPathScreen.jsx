import { useState, useEffect, useRef } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import {
    loadSegments, saveSegments, addSegment,
    deleteSegment, exportToJson, importFromJson,
    buildGraphFromSegments,
} from '../utils/walkablePaths.js';
import '../styles/AdminPath.css';

// SVG map bounds (match FloorMapView)
const W = 400, H = 520;
const LAT_MIN = 17.38495, LAT_MAX = 17.38535;
const LNG_MIN = 78.48645, LNG_MAX = 78.48680;
function project(lat, lng) {
    return {
        x: ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - 60) + 30,
        y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 80) + 40,
    };
}

const FLOORS = ['ground', 'first'];

export default function AdminPathScreen() {
    const { gpsPos, gpsError, setViewMode, refreshGraph } = useNav();

    const [floor, setFloor] = useState('ground');
    const [segments, setSegments] = useState([]);
    const [mode, setMode] = useState('idle');        // 'idle' | 'waitStart' | 'waitEnd'
    const [pendingStart, setPendingStart] = useState(null);
    const [pendingLabel, setPendingLabel] = useState('');
    const [endLabel, setEndLabel] = useState('');
    const [status, setStatus] = useState('');
    const [showList, setShowList] = useState(false);
    const importRef = useRef();

    // Load segments on mount
    useEffect(() => { setSegments(loadSegments()); }, []);

    const floorSegs = segments.filter(s => s.floor === floor);

    // ── Mark Start ──
    const handleMarkStart = () => {
        if (!gpsPos) { setStatus('⚠️ Waiting for GPS…'); return; }
        setPendingStart({ lat: gpsPos.lat, lng: gpsPos.lng });
        setPendingLabel('');
        setEndLabel('');
        setMode('waitEnd');
        setStatus(`📍 Start captured: ${gpsPos.lat.toFixed(6)}, ${gpsPos.lng.toFixed(6)}`);
    };

    // ── Mark End ──
    const handleMarkEnd = () => {
        if (!gpsPos) { setStatus('⚠️ Waiting for GPS…'); return; }
        if (!pendingStart) { setStatus('⚠️ No start point yet.'); return; }

        const newSeg = {
            id: `seg-${Date.now()}`,
            floor,
            start: { lat: pendingStart.lat, lng: pendingStart.lng, label: pendingLabel || 'Point' },
            end: { lat: gpsPos.lat, lng: gpsPos.lng, label: endLabel || 'Point' },
        };
        const updated = addSegment(newSeg);
        setSegments(updated);
        refreshGraph(updated);

        // Auto-chain: end becomes new start
        setPendingStart({ lat: gpsPos.lat, lng: gpsPos.lng });
        setPendingLabel(endLabel || 'Point');
        setEndLabel('');
        setStatus(`✅ Segment saved! End point is now new start. Continue walking or press Done.`);
    };

    // ── Done recording ──
    const handleDone = () => {
        setPendingStart(null);
        setMode('idle');
        setStatus('Recording finished.');
    };

    // ── Delete segment ──
    const handleDelete = (id) => {
        const updated = deleteSegment(id);
        setSegments(updated);
        refreshGraph(updated);
    };

    // ── Import JSON ──
    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const updated = importFromJson(ev.target.result);
                setSegments(updated);
                refreshGraph(updated);
                setStatus('✅ Paths imported successfully!');
            } catch (_) {
                setStatus('❌ Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="ap-root">
            {/* Header */}
            <div className="ap-header">
                <button className="ap-back" onClick={() => setViewMode('map')}>‹ Back</button>
                <h1 className="ap-title">🛠️ Admin – Path Recorder</h1>
                <div className="ap-tools">
                    <button className="ap-tool-btn" title="Export JSON" onClick={() => exportToJson(segments)}>⬇ Export</button>
                    <button className="ap-tool-btn" title="Import JSON" onClick={() => importRef.current.click()}>⬆ Import</button>
                    <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                </div>
            </div>

            {/* Floor selector */}
            <div className="ap-tabs">
                {FLOORS.map(f => (
                    <button key={f} className={`ap-tab ${floor === f ? 'active' : ''}`} onClick={() => setFloor(f)}>
                        {f === 'ground' ? '🏠 Ground' : '🏢 1st Floor'}
                    </button>
                ))}
            </div>

            {/* GPS badge */}
            <div className="ap-gps-row">
                <span className={`ap-gps-badge ${gpsPos ? 'ok' : 'bad'}`}>
                    {gpsPos
                        ? `📍 ${gpsPos.lat.toFixed(6)}, ${gpsPos.lng.toFixed(6)}  ±${Math.round(gpsPos.accuracy)}m`
                        : gpsError ? `⚠️ ${gpsError}` : '⏳ Acquiring GPS…'}
                </span>
            </div>

            {/* Mini SVG map showing recorded segments */}
            <div className="ap-map-wrap">
                <svg viewBox={`0 0 ${W} ${H}`} className="ap-svg">
                    <rect x="0" y="0" width={W} height={H} fill="#0a0d1a" rx="10" />
                    <rect x="20" y="30" width={W - 40} height={H - 60} fill="#12172a" stroke="#1e2540" strokeWidth="1.5" rx="6" />
                    <text x={W / 2} y="22" textAnchor="middle" fill="#5566aa" fontSize="10" fontFamily="Inter">
                        {floor === 'ground' ? 'Ground Floor' : 'First Floor'} – Recorded Paths
                    </text>

                    {/* Draw existing segments */}
                    {floorSegs.map((seg, i) => {
                        const s = project(seg.start.lat, seg.start.lng);
                        const e = project(seg.end.lat, seg.end.lng);
                        return (
                            <g key={seg.id}>
                                <line x1={s.x} y1={s.y} x2={e.x} y2={e.y}
                                    stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                                <circle cx={s.x} cy={s.y} r="4" fill="#818cf8" />
                                <circle cx={e.x} cy={e.y} r="4" fill="#818cf8" />
                                <text x={(s.x + e.x) / 2} y={(s.y + e.y) / 2 - 5} textAnchor="middle"
                                    fill="#5566dd" fontSize="7" fontFamily="Inter">
                                    {i + 1}
                                </text>
                            </g>
                        );
                    })}

                    {/* Pending start point */}
                    {pendingStart && (() => {
                        const p = project(pendingStart.lat, pendingStart.lng);
                        return (
                            <g>
                                <circle cx={p.x} cy={p.y} r="8" fill="rgba(16,185,129,.3)" className="ap-pulse" />
                                <circle cx={p.x} cy={p.y} r="5" fill="#10b981" />
                                <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#6ee7b7" fontSize="9">START</text>
                            </g>
                        );
                    })()}

                    {/* Live GPS dot */}
                    {gpsPos && (() => {
                        const p = project(gpsPos.lat, gpsPos.lng);
                        return (
                            <g>
                                <circle cx={p.x} cy={p.y} r="6" fill="rgba(99,102,241,.3)" className="ap-pulse" />
                                <circle cx={p.x} cy={p.y} r="4" fill="#818cf8" />
                                <circle cx={p.x} cy={p.y} r="2" fill="white" />
                            </g>
                        );
                    })()}
                </svg>
            </div>

            {/* Status bar */}
            {status && <div className="ap-status">{status}</div>}

            {/* Label inputs */}
            {mode === 'waitEnd' && (
                <div className="ap-labels">
                    <input
                        className="ap-label-input"
                        placeholder="Start point name (optional)"
                        value={pendingLabel}
                        onChange={e => setPendingLabel(e.target.value)}
                    />
                    <input
                        className="ap-label-input"
                        placeholder="End point name (optional)"
                        value={endLabel}
                        onChange={e => setEndLabel(e.target.value)}
                    />
                </div>
            )}

            {/* Action buttons */}
            <div className="ap-actions">
                {mode === 'idle' && (
                    <button className="ap-btn start" onClick={handleMarkStart}>
                        📍 Mark Start Point
                    </button>
                )}
                {mode === 'waitEnd' && (
                    <>
                        <button className="ap-btn end" onClick={handleMarkEnd}>
                            🏁 Mark End Point
                        </button>
                        <button className="ap-btn done" onClick={handleDone}>
                            ✓ Done Recording
                        </button>
                    </>
                )}
            </div>

            {/* Segments list toggle */}
            <div className="ap-list-header" onClick={() => setShowList(v => !v)}>
                <span>📋 Recorded Segments on this floor ({floorSegs.length})</span>
                <span className="ap-chevron">{showList ? '▲' : '▼'}</span>
            </div>

            {showList && (
                <div className="ap-seg-list">
                    {floorSegs.length === 0 && (
                        <p className="ap-empty">No segments recorded on this floor yet.</p>
                    )}
                    {floorSegs.map((seg, i) => (
                        <div key={seg.id} className="ap-seg-row">
                            <div className="ap-seg-num">#{i + 1}</div>
                            <div className="ap-seg-info">
                                <span className="ap-seg-from">{seg.start.label || 'Point'}</span>
                                <span className="ap-seg-arrow">→</span>
                                <span className="ap-seg-to">{seg.end.label || 'Point'}</span>
                                <span className="ap-seg-coords">
                                    ({seg.start.lat.toFixed(5)},{seg.start.lng.toFixed(5)})
                                    → ({seg.end.lat.toFixed(5)},{seg.end.lng.toFixed(5)})
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
