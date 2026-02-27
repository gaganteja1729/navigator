import { NavigationProvider, useNav } from './context/NavigationContext.jsx';
import FloorSelectScreen from './screens/FloorSelectScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import FloorMapView from './screens/FloorMapView.jsx';
import ARView from './screens/ARView.jsx';
import AdminPathScreen from './screens/AdminPathScreen.jsx';
import './App.css';

function AppRouter() {
  const { currentFloor, viewMode, destNodeId } = useNav();

  // 1. No floor chosen → show floor selector
  if (!currentFloor) return <FloorSelectScreen />;

  // 2. Admin path recorder
  if (viewMode === 'admin') return <AdminPathScreen />;

  // 3. AR mode
  if (viewMode === 'ar' && destNodeId) return <ARView />;

  // 4. Map view with route
  if (destNodeId) return <FloorMapView />;

  // 5. Default: Home (search)
  return <HomeScreen />;
}

export default function App() {
  return (
    <NavigationProvider>
      <AppRouter />
    </NavigationProvider>
  );
}
