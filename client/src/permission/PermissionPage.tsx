import { useState, useEffect } from 'react';
import { Mic, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { BhashaLogo } from '../components/common/BhashaLogo';

export function PermissionPage() {
  const [status, setStatus] = useState<'IDLE' | 'REQUESTING' | 'GRANTED' | 'DENIED'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check initial permissions
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((res) => {
          if (res.state === 'granted') {
            setStatus('GRANTED');
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleRequestPermission = async () => {
    setStatus('REQUESTING');
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      setStatus('GRANTED');

      // Notify the extension side panel via runtime message
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }, () => {
          // Ignore chrome.runtime.lastError when no receiver
          void chrome.runtime.lastError;
        });
      }

      // Auto close after 2 seconds
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.close();
        }
      }, 2000);
    } catch (err: unknown) {
      setStatus('DENIED');
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was not allowed. Look for the microphone or lock icon in the browser address bar above and select "Always allow", then click Try Again.',
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setErrorMessage('No microphone device was detected on your computer.');
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to obtain microphone permission.',
        );
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center flex flex-col items-center">
      {/* Brand logo */}
      <BhashaLogo className="w-12 h-12 rounded-xl mb-4 shadow-2xs" />

      {/* Icon header */}
      <div className="w-16 h-16 rounded-2xl bg-[#DCE7DC] text-[#102A24] flex items-center justify-center mb-5 shadow-xs">
        {status === 'GRANTED' ? (
          <CheckCircle2 className="w-9 h-9 text-[#1E6B42] animate-fade-in" />
        ) : status === 'DENIED' ? (
          <AlertCircle className="w-9 h-9 text-rose-600 animate-fade-in" />
        ) : (
          <Mic className="w-9 h-9 text-[#102A24]" />
        )}
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-2">
        {status === 'GRANTED'
          ? 'Microphone Access Enabled!'
          : 'Enable Microphone for BhashaAgent'}
      </h1>

      <p className="text-sm text-gray-600 mb-6 max-w-sm leading-relaxed">
        {status === 'GRANTED'
          ? 'You can now speak to BhashaAgent in English, Hindi, Marathi, and Hinglish. This tab will close automatically.'
          : 'Google Chrome requires one-time microphone access on this setup page so you can converse naturally inside the side panel.'}
      </p>

      {/* Action button */}
      {status === 'GRANTED' ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Ready for voice conversations</span>
          </div>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-2 text-xs text-blue-600 hover:underline font-medium"
          >
            Close this tab now
          </button>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => void handleRequestPermission()}
            disabled={status === 'REQUESTING'}
            className="w-full py-3 px-5 rounded-xl bg-[#102A24] hover:bg-[#17483A] text-white font-medium text-sm transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            <span>
              {status === 'REQUESTING'
                ? 'Prompting in browser...'
                : status === 'DENIED'
                  ? 'Try Again'
                  : 'Allow Microphone Access'}
            </span>
          </button>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-left text-xs text-rose-700">
              <p className="font-semibold mb-1">Permission Needed</p>
              <p className="leading-normal">{errorMessage}</p>
            </div>
          )}

          <p className="text-[11px] text-gray-500 leading-normal">
            BhashaAgent only captures audio while you actively speak or interact in Voice Mode.
          </p>
        </div>
      )}
    </div>
  );
}

