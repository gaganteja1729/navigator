import { useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import { nodes } from '../data/campusData.js';
import '../styles/HomeScreen.css';

export default function HomeScreen() {
    const {
        currentFloor, setCurrentFloor,
        setDestNodeId,
        startNodeId, setStartNodeId,
        gpsPos, gpsError,
        setViewMode,
        selectableNodes,
    } = useNav();

    const [query, setQuery] = useState('');
    const [showFloorRooms, setShowFloorRooms] = useState(currentFloor);

    const filtered = selectableNodes
        .filter(n => n.floor === showFloorRooms && n.type !== 'corridor')
        .filter(n => n.name.toLowerCase().includes(query.toLowerCase()));

    const handleSelect = (node) => {
        setDestNodeId(node.id);
        setViewMode('ar');
    };

    return (
        <div className="hs-root">
            {/* Header */}
            <div className="hs-header">
                <div className="hs-header-top">
                    <h1 className="hs-title">🏫 Campus Nav</h1>
                    <span className={`hs-gps-badge ${gpsPos ? 'active' : 'inactive'}`}>
                        {gpsPos ? '📍 GPS Active' : gpsError ? '⚠️ No GPS' : '⏳ Getting GPS…'}
                    </span>
                </div>
                <p className="hs-floor-label">
                    You are on: <strong>{currentFloor === 'ground' ? 'Ground Floor' : '1st Floor'}</strong>
                    <button className="hs-switch-link" onClick={() => setCurrentFloor(null)}>Change</button>
                </p>
            </div>

            {/* Floor tab filter */}
            <div className="hs-tabs">
                <button
                    className={`hs-tab ${showFloorRooms === 'ground' ? 'active' : ''}`}
                    onClick={() => setShowFloorRooms('ground')}
                >🏠 Ground Floor</button>
                <button
                    className={`hs-tab ${showFloorRooms === 'first' ? 'active' : ''}`}
                    onClick={() => setShowFloorRooms('first')}
                >🏢 1st Floor</button>
            </div>

            {/* Search */}
            <div className="hs-search-wrap">
                <span className="hs-search-icon">🔍</span>
                <input
                    className="hs-search"
                    placeholder="Search destination…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {query && (
                    <button className="hs-clear" onClick={() => setQuery('')}>✕</button>
                )}
            </div>

            {/* GPS accuracy banner */}
            {gpsPos && (
                <div className="hs-acc-banner">
                    GPS accuracy: ±{Math.round(gpsPos.accuracy)}m
                    {gpsPos.accuracy > 20 && <span className="hs-acc-warn"> (Try moving outdoors)</span>}
                </div>
            )}

            {/* Destination list */}
            <div className="hs-list">
                {filtered.length === 0 && (
                    <p className="hs-empty">No results for "{query}"</p>
                )}
                {filtered.map(node => (
                    <button key={node.id} className="hs-dest-card" onClick={() => handleSelect(node)}>
                        <span className="hs-dest-icon">{node.icon}</span>
                        <div className="hs-dest-info">
                            <span className="hs-dest-name">{node.name}</span>
                            <span className="hs-dest-type">
                                {showFloorRooms === 'ground' ? 'Ground Floor' : '1st Floor'}
                                {node.type === 'staircase' && ' · Staircase'}
                                {node.type === 'lab' && ' · Laboratory'}
                                {node.type === 'office' && ' · Office'}
                            </span>
                        </div>
                        <span className="hs-dest-arrow">›</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
