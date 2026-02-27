import { NavigationProvider, useNav } from './context/NavigationContext.jsx';
import FloorSelectScreen from './screens/FloorSelectScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import FloorMapView from './screens/FloorMapView.jsx';
import ARView from './screens/ARView.jsx';
import AdminPathScreen from './screens/AdminPathScreen.jsx';
import './App.css';

function AppRouter() {
  const { currentScreen } = useNav();

  switch (currentScreen) {
    case 'floor-select': return <FloorSelectScreen />;
    case 'home': return <HomeScreen />;
    case 'map': return <FloorMapView />;
    case 'ar': return <ARView />;
    case 'admin': return <AdminPathScreen />;
    default: return <FloorSelectScreen />;
  }
}

export default function App() {
  return (
    <NavigationProvider>
      <AppRouter />
    </NavigationProvider>
  );
}
