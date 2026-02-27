import { NavigationProvider, useNav } from './context/NavigationContext.jsx';
import FloorSelectScreen from './screens/FloorSelectScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import FloorMapView from './screens/FloorMapView.jsx';
import ARView from './screens/ARView.jsx';
import './App.css';

function AppRouter() {
  const { currentFloor, viewMode, destNodeId } = useNav();

  // 1. No floor chosen → show floor selector
  if (!currentFloor) return <FloorSelectScreen />;

  // 2. AR mode (destination selected)
  if (viewMode === 'ar' && destNodeId) return <ARView />;

  // 3. Map view (destination selected → show map + home search)
  if (destNodeId) {
    return (
      <div className="nav-split">
        <FloorMapView />
      </div>
    );
  }

  // 4. Default → Home (destination search)
  return <HomeScreen />;
}

export default function App() {
  return (
    <NavigationProvider>
      <AppRouter />
    </NavigationProvider>
  );
}
