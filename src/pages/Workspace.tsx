import Canvas from '../components/workspace/Canvas';
import Sidebar from '../components/workspace/Sidebar';
import Inspector from '../components/workspace/Inspector';
import CodePreview from '../components/workspace/CodePreview';
import Toolbar from '../components/workspace/Toolbar';

export default function Workspace({ onExitWorkspace }: { onExitWorkspace: () => void }) {
  return (
    <div className="w-full h-full flex flex-col bg-background">
      <Toolbar onExitWorkspace={onExitWorkspace} />
      
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        <Canvas />
        <Inspector />
      </div>
      
      <CodePreview />
    </div>
  );
}
