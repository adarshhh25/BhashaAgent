import { AlertCircle, RefreshCw, ExternalLink, Info, ServerOff } from 'lucide-react';
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
  const lowerMsg = message.toLowerCase();

  const isPermissionIssue =
    lowerMsg.includes('permission') ||
    lowerMsg.includes('microphone access') ||
    lowerMsg.includes('denied');

  const isBackendUnavailable =
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('connection refused') ||
    lowerMsg.includes('err_connection_refused') ||
    lowerMsg.includes('network error') ||
    lowerMsg.includes('networkerror');

  const isAuthRequired =
    lowerMsg.includes('authentication required') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('http_401');

  const isTicketIssue =
    lowerMsg.includes('invalid or expired voice ticket') ||
    lowerMsg.includes('missing voice ticket') ||
    lowerMsg.includes('voice ticket') ||
    lowerMsg.includes('ticket');

  const isConversationIssue =
    lowerMsg.includes('conversation has been deleted') ||
    lowerMsg.includes('conversation not active') ||
    lowerMsg.includes('conversation not found') ||
    lowerMsg.includes('http_410') ||
    lowerMsg.includes('http_409') ||
    lowerMsg.includes('http_404');

  const isInactivityTimeout =
    lowerMsg.includes('60 seconds') ||
    lowerMsg.includes('no speech segment');

  const isRateLimited =
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('rate limited') ||
    lowerMsg.includes('agent_rate_limited');

  const isMaxConcurrent =
    lowerMsg.includes('max active') ||
    lowerMsg.includes('max concurrent') ||
    lowerMsg.includes('maximum concurrent');

  const isProviderIssue =
    lowerMsg.includes('speech provider') ||
    lowerMsg.includes('provider disconnected') ||
    lowerMsg.includes('provider_error');

  const isSocketClosed =
    lowerMsg.includes('websocket closed') ||
    lowerMsg.includes('status code: 1006');

  // Friendly human-readable message mapping
  const displayTitle = isPermissionIssue
    ? 'Microphone Permission Needed'
    : isBackendUnavailable
      ? 'Backend Unavailable'
      : isAuthRequired
        ? 'Authentication Required'
        : isTicketIssue
          ? 'Voice Ticket Expired'
          : isConversationIssue
            ? 'Conversation Unavailable'
            : isMaxConcurrent
              ? 'Voice Limit Reached'
              : isInactivityTimeout
                ? 'Voice Inactive'
                : isRateLimited
                  ? 'Assistant Busy'
                  : isProviderIssue
                    ? 'Speech Provider Offline'
                    : 'Voice Connection';

  const displayMessage = isPermissionIssue
    ? 'Microphone access is required. Click below to grant access in Chrome.'
    : isBackendUnavailable
      ? 'Cannot reach the BhashaAgent backend server at http://localhost:5000. Please start the server and retry.'
      : isAuthRequired
        ? 'Your session has expired. Please sign in to use voice assistance.'
        : isTicketIssue
          ? 'Voice session ticket could not be validated. Click Retry to issue a fresh ticket.'
          : isConversationIssue
            ? 'This conversation is not active. Please select or create an active conversation.'
            : isMaxConcurrent
              ? 'Maximum concurrent voice sessions reached (limit: 2). Please close other voice tabs or wait a moment.'
              : isInactivityTimeout
                ? 'Voice session paused after silence. Click Retry to speak again.'
                : isRateLimited
                  ? 'The assistant is temporarily rate-limited. Please wait a few seconds and retry.'
                  : isProviderIssue
                    ? 'Speech service is temporarily unreachable. Please retry in a few moments.'
                    : isSocketClosed
                      ? 'Voice connection dropped. Click Retry to reconnect.'
                      : message;

  return (
    <div
      className={`p-3 rounded-xl text-xs flex flex-col gap-2.5 animate-fade-in shadow-xs ${
        isInactivityTimeout
          ? 'bg-card border border-divider text-text-secondary'
          : isRateLimited
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300'
            : isBackendUnavailable
              ? 'bg-[#102A24]/10 border border-[#17483A]/30 text-[#102A24]'
              : 'bg-error/10 border border-error/20 text-error'
      } ${className}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {isInactivityTimeout ? (
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-text-secondary" />
        ) : isBackendUnavailable ? (
          <ServerOff className="w-4 h-4 shrink-0 mt-0.5 text-[#17483A]" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[11px] leading-tight mb-0.5">{displayTitle}</p>
          <p className="text-[11px] leading-tight break-words opacity-90">{displayMessage}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-current/15">
        {isPermissionIssue && (
          <button
            type="button"
            onClick={openMicrophonePermissionTab}
            className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-[#17483A] hover:bg-[#102A24] text-white font-medium text-[11px] transition-colors shadow-2xs cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Grant Permission</span>
          </button>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg border font-medium text-[11px] transition-colors cursor-pointer ${
              isInactivityTimeout
                ? 'border-divider hover:bg-page-bg text-text-primary'
                : isRateLimited
                  ? 'border-amber-500/30 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : isBackendUnavailable
                    ? 'border-[#17483A]/40 hover:bg-[#17483A]/10 text-[#102A24]'
                    : 'border-error/30 hover:bg-error/15 text-error'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}
