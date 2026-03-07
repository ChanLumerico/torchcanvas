import { useState } from 'react';
import LandingPage from './pages/LandingPage';
import Workspace from './pages/Workspace';

function App() {
  const [currentView, setCurrentView] = useState<'landing' | 'workspace'>('landing');

  return (
    <div className="w-screen h-screen bg-background text-textMain overflow-hidden font-sans">
      {currentView === 'landing' ? (
        <LandingPage onEnterWorkspace={() => setCurrentView('workspace')} />
      ) : (
        <Workspace onExitWorkspace={() => setCurrentView('landing')} />
      )}
    </div>
  );
}

export default App;
