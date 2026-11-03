import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { openMicrophonePermissionTab } from '../hooks/useMicrophonePermission';

interface VoiceErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function VoiceErrorMessage({
  message,
  onRetry,
  className = '',
}: VoiceErrorMessageProps) {
  const isPermissionIssue =
    message.toLowerCase().includes('permission') ||
    message.toLowerCase().includes('microphone access') ||
    message.toLowerCase().includes('denied');

  return (
    <div
      className={`p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex flex-col gap-2.5 animate-fade-in ${className}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="text-[11px] leading-tight break-words">{message}</span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-error/15">
        {isPermissionIssue && (
          <button
            type="button"
            onClick={openMicrophonePermissionTab}
            className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-accent text-white font-medium text-[11px] hover:bg-accent/90 transition-colors shadow-2xs cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Grant Permission</span>
          </button>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg border border-error/30 hover:bg-error/15 text-error font-medium text-[11px] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}
