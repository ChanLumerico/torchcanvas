import { ArrowRight, Boxes, Network, ScanSearch } from 'lucide-react';

export default function LandingPage({ onEnterWorkspace }: { onEnterWorkspace: () => void }) {
  return (
    <div className="w-full h-full overflow-y-auto bg-background selection:bg-primary/30 relative">
      {/* Background gradients */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />

      <nav className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg">
            <Network className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">TorchCanvas</span>
        </div>
        <div className="flex items-center gap-6">
          <button className="text-sm font-medium text-textMuted hover:text-white transition-colors">Documentation</button>
          <button className="text-sm font-medium text-textMuted hover:text-white transition-colors">Examples</button>
          <button 
            onClick={onEnterWorkspace}
            className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-white shadow-sm"
          >
            Launch App
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-24 relative z-10 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-8 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          TorchCanvas v1.0 is now in Beta
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] max-w-4xl text-white mb-6">
          Design Neural Networks <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Visually.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-textMuted max-w-2xl mb-12 leading-relaxed">
          The node-based architecture builder for PyTorch. Drag, drop, and connect layers to instantly generate production-ready deep learning code.
        </p>

        <div className="flex items-center gap-4">
          <button 
            onClick={onEnterWorkspace}
            className="px-8 py-4 bg-[#EE4C2C] hover:bg-[#D93B1F] text-white rounded-xl font-semibold transition-all shadow-[0_0_40px_-10px_rgba(238,76,44,0.6)] flex items-center gap-3 group"
          >
            Start Designing
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Fake UI Preview Window */}
        <div className="mt-28 w-full max-w-5xl rounded-2xl glass-panel p-2 overflow-hidden shadow-2xl relative border border-border/80">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-transparent z-10 pointer-events-none" />
          <div className="rounded-xl overflow-hidden bg-panel/30 border border-border/50 h-[450px] flex">
            {/* Fake Sidebar */}
            <div className="w-48 border-r border-border/50 p-4 flex flex-col gap-3">
              <div className="h-4 w-20 bg-white/10 rounded" />
              <div className="mt-4 space-y-2">
                <div className="h-8 w-full bg-white/5 rounded" />
                <div className="h-8 w-full bg-white/5 rounded" />
                <div className="h-8 w-full bg-white/5 rounded" />
                <div className="h-8 w-full bg-white/5 rounded" />
              </div>
            </div>
            {/* Fake Canvas */}
            <div className="flex-1 relative bg-[#0d121c]">
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-16">
                <div className="w-32 h-16 bg-panel border-2 border-border/80 rounded-lg shadow-lg flex items-center justify-center relative">
                  <span className="text-xs font-mono font-medium text-textMuted">Stem</span>
                  <div className="absolute right-[-64px] w-16 h-[2px] bg-primary/60" />
                </div>
                <div className="w-32 h-16 bg-orange-900/20 border-2 border-orange-500/50 rounded-lg shadow-[0_0_20px_-5px_rgba(238,76,44,0.3)] flex items-center justify-center relative">
                  <span className="text-xs font-mono font-medium text-orange-300">Conv2d</span>
                  <div className="absolute right-[-64px] w-16 h-[2px] bg-border" />
                </div>
                <div className="w-32 h-16 bg-panel border-2 border-border/80 rounded-lg shadow-lg flex items-center justify-center relative">
                  <span className="text-xs font-mono font-medium text-textMuted">ReLU</span>
                  <div className="absolute right-[-64px] w-16 h-[2px] bg-border" />
                </div>
                <div className="w-32 h-16 bg-panel border-2 border-border/80 rounded-lg shadow-lg flex items-center justify-center">
                  <span className="text-xs font-mono font-medium text-textMuted">Linear</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left max-w-5xl w-full">
          <div className="p-8 rounded-2xl glass-panel relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Boxes className="w-8 h-8 text-orange-400 mb-5 relative z-10" />
            <h3 className="text-lg font-bold text-white mb-3 relative z-10">Composability</h3>
            <p className="text-sm text-textMuted leading-relaxed relative z-10">Drag and drop standard PyTorch layers to build complex model topologies without writing boilerplate code.</p>
          </div>
          <div className="p-8 rounded-2xl glass-panel relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <ScanSearch className="w-8 h-8 text-red-400 mb-5 relative z-10" />
            <h3 className="text-lg font-bold text-white mb-3 relative z-10">Graph Validation</h3>
            <p className="text-sm text-textMuted leading-relaxed relative z-10">Catch invalid container wiring, missing inputs, and graph integrity issues before exporting your model code.</p>
          </div>
          <div className="p-8 rounded-2xl glass-panel relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="font-mono text-2xl font-bold text-teal-400 mb-5 block relative z-10">{'</>'}</span>
            <h3 className="text-lg font-bold text-white mb-3 relative z-10">Code Generation</h3>
            <p className="text-sm text-textMuted leading-relaxed relative z-10">Every visual change is instantly compiled into clean, production-ready PyTorch code you can copy and use.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
