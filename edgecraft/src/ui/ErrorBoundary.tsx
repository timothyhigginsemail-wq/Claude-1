import { Component, type ReactNode } from 'react';
import { clearSave } from './storage';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="panel p-6 max-w-lg">
          <div className="label text-neg">Something went wrong</div>
          <p className="mt-2 text-[13px] text-ink2">Edgecraft hit an unexpected error. Your campaign is saved after every turn, so reloading usually resumes where you left off.</p>
          <pre className="num text-[11px] mt-3 p-2 bg-panel2 rounded-md overflow-x-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
            <button className="btn" onClick={() => { if (confirm('Discard the saved campaign and start over?')) { clearSave(); location.reload(); } }}>Discard save &amp; reload</button>
          </div>
        </div>
      </div>
    );
  }
}
