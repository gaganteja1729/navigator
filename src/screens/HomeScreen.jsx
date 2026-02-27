import { useState } from 'react';
import { useNav } from '../context/NavigationContext.jsx';
import '../styles/HomeScreen.css';

export default function HomeScreen() {
    const {
        currentFloor, changeFloor,
        selectDestination,
        gpsPos, gpsError,
        navigate,
        selectableNodes,
        setCurrentFloor,   // for "Change floor" → back to floor-select
        screenStack,
    } = useNav();

    const [query, setQuery] = useState('');
    const [showFloorRooms, setShowFloorRooms] = useState(currentFloor);

    const filtered = selectableNodes
        .filter(n => n.floor === showFloorRooms && n.type !== 'corridor')
        .filter(n => n.name.toLowerCase().includes(query.toLowerCase()));

    return (
        <div className="hs-root">
            {/* Header */}
            <div className="hs-header">
                <div className="hs-header-top">
                    <h1 className="hs-title">🏫 Campus Nav</h1>
                    <span className={`hs-gps-badge ${gpsPos ? 'active' : 'inactive'}`}>
                        {gpsPos ? '📍 GPS' : gpsError ? '⚠️ No GPS' : '⏳ GPS…'}
                    </span>
                </div>
                <div className="hs-header-bottom-row">
                    <p className="hs-floor-label">
                        On: <strong>{currentFloor === 'ground' ? 'Ground Floor' : '1st Floor'}</strong>
                        <button
                            className="hs-switch-link"
                            onClick={() => {
                                // Push floor-select back onto stack so goBack works naturally
                                navigate('floor-select');
                            }}
                        >Change</button>
                    </p>
                    <button className="hs-admin-btn" onClick={() => navigate('admin')}>
                        🛠️ Admin
                    </button>
                </div>
            </div>

            {/* Floor tab filter */}
            <div className="hs-tabs">
                <button
                    className={`hs-tab ${showFloorRooms === 'ground' ? 'active' : ''}`}
                    onClick={() => setShowFloorRooms('ground')}
                >🏠 Ground</button>
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
                    GPS ±{Math.round(gpsPos.accuracy)}m
                    {gpsPos.accuracy > 20 && <span className="hs-acc-warn"> — try outdoors</span>}
                </div>
            )}

            {/* Destination list */}
            <div className="hs-list">
                {filtered.length === 0 && (
                    <p className="hs-empty">No results for &ldquo;{query}&rdquo;</p>
                )}
                {filtered.map(node => (
                    <button key={node.id} className="hs-dest-card" onClick={() => selectDestination(node.id)}>
                        <span className="hs-dest-icon">{node.icon}</span>
                        <div className="hs-dest-info">
                            <span className="hs-dest-name">{node.name}</span>
                            <span className="hs-dest-type">
                                {showFloorRooms === 'ground' ? 'Ground Floor' : '1st Floor'}
                                {node.type === 'staircase' && ' · Staircase'}
                                {node.type === 'lab' && ' · Lab'}
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
