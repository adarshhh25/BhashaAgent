import { Globe, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import type { BrowserConnectionStatus } from '../hooks/useBrowserConnection';

interface BrowserConnectionBannerProps {
  status: BrowserConnectionStatus;
  activeUrl: string | null;
  activeTitle: string | null;
  taskUrl?: string | null;
  isRegisteringSession: boolean;
  onRefresh: () => void;
}

export function BrowserConnectionBanner({
  status,
  activeUrl,
  activeTitle,
  taskUrl,
  isRegisteringSession,
  onRefresh,
}: BrowserConnectionBannerProps) {
  const isConnected = status === 'CONNECTED';
  const isMismatch = status === 'MISMATCH';

  return (
    <div
      className={`p-3 rounded-xl border text-xs flex flex-col gap-2 transition-all ${
        isConnected
          ? 'bg-success/5 border-success/20 text-text-primary'
          : isMismatch
          ? 'bg-warning/10 border-warning/20 text-text-primary'
          : 'bg-card border-divider text-text-secondary'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              isConnected
                ? 'bg-success/15 text-success'
                : isMismatch
                ? 'bg-warning/20 text-warning'
                : 'bg-divider/50 text-text-secondary'
            }`}
          >
            {isConnected ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : isMismatch ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <span>Browser Context:</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                  isConnected
                    ? 'bg-success/15 text-success'
                    : isMismatch
                    ? 'bg-warning/20 text-warning'
                    : 'bg-divider/50 text-text-secondary'
                }`}
              >
                {isConnected
                  ? 'Matched'
                  : isMismatch
                  ? 'URL Mismatch'
                  : 'Checking'}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary truncate mt-0.5" title={activeUrl || ''}>
              {activeTitle || activeUrl || 'No active webpage tab'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRegisteringSession}
          className="p-1.5 rounded-lg border border-divider hover:bg-card/80 transition-colors text-text-secondary shrink-0"
          title="Refresh active tab connection"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRegisteringSession ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {isMismatch && taskUrl && (
        <div className="p-2 bg-warning/15 rounded-lg text-[11px] text-warning flex flex-col gap-1 leading-tight">
          <span className="font-semibold">Attention: Current page differs from approved task</span>
          <span className="truncate" title={taskUrl}>
            Approved: {taskUrl}
          </span>
          <span className="text-[10px] text-text-secondary">
            Switch to the correct tab in Chrome to authorize form filling.
          </span>
        </div>
      )}
    </div>
  );
}

