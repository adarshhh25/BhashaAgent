import { useState, useEffect, useRef } from 'react';
import { Languages, User, LogOut, ExternalLink, Loader2 } from 'lucide-react';
import PopupLayout from '../../layouts/PopupLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { LoginForm } from '../../features/auth/components/LoginForm';
import { RegisterForm } from '../../features/auth/components/RegisterForm';

export default function PopupPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const activeTabIdRef = useRef<number | null>(null);

  // Discover active Chrome tab immediately on popup mount so the tabId is resolved
  // before the user clicks, enabling synchronous chrome.sidePanel.open() under user gesture
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          activeTabIdRef.current = tab.id;
          console.log('[PopupPage] Discovered active tab for Side Panel:', {
            tabId: tab.id,
            url: tab.url,
            sidePanelSupported: typeof chrome.sidePanel !== 'undefined',
            openSupported: typeof chrome.sidePanel?.open === 'function',
          });

          // Pre-enable side panel for this specific tab to ensure tab-specific options are active
          if (chrome.sidePanel?.setOptions) {
            chrome.sidePanel
              .setOptions({
                tabId: tab.id,
                path: 'index.html',
                enabled: true,
              })
              .catch((err: unknown) => {
                console.warn('[PopupPage] Pre-enabling side panel notice:', err);
              });
          }
        }
      });
    }
  }, []);

  /**
   * Handle Open Side Panel click:
   * Chrome requires chrome.sidePanel.open() to be called in direct response to a user action.
   * We invoke it directly and synchronously without preceding awaits or background message hops.
   */
  const handleOpenSidePanel = () => {
    if (isOpening) return;
    setOpenError(null);

    if (
      typeof chrome === 'undefined' ||
      !chrome.sidePanel ||
      typeof chrome.sidePanel.open !== 'function'
    ) {
      const msg = 'Side Panel is not supported in this browser version.';
      console.error('[PopupPage]', msg);
      setOpenError(msg);
      return;
    }

    const tabId = activeTabIdRef.current;
    if (tabId) {
      setIsOpening(true);
      console.log('[PopupPage] Initiating chrome.sidePanel.open for tabId:', tabId);

      // Invoke open directly within synchronous user gesture context
      chrome.sidePanel
        .open({ tabId })
        .then(() => {
          console.log('[PopupPage] Side Panel opened successfully for tabId:', tabId);
          window.close();
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[PopupPage] Failed to open side panel for tab:', tabId, message);
          setOpenError(message);
          setIsOpening(false);
        });
    } else {
      // Fallback: resolve tab in user-gesture callback if clicked prior to mount resolution
      setIsOpening(true);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const fallbackTabId = tabs[0]?.id;
        if (!fallbackTabId) {
          const msg = 'No active browser tab found to open side panel.';
          console.error('[PopupPage]', msg);
          setOpenError(msg);
          setIsOpening(false);
          return;
        }

        activeTabIdRef.current = fallbackTabId;

        if (chrome.sidePanel?.setOptions) {
          chrome.sidePanel
            .setOptions({
              tabId: fallbackTabId,
              path: 'index.html',
              enabled: true,
            })
            .catch(() => {});
        }

        chrome.sidePanel
          .open({ tabId: fallbackTabId })
          .then(() => {
            console.log('[PopupPage] Side Panel opened via fallback for tabId:', fallbackTabId);
            window.close();
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[PopupPage] Failed to open side panel via fallback:', message);
            setOpenError(message);
            setIsOpening(false);
          });
      });
    }
  };

  if (isLoading) {
    return (
      <PopupLayout>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <p className="text-xs text-text-secondary">Checking session...</p>
        </div>
      </PopupLayout>
    );
  }

  // Authenticated View
  if (isAuthenticated && user) {
    return (
      <PopupLayout>
        <div className="flex-1 flex flex-col justify-between">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-divider">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white">
                  <Languages className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <span className="text-xs font-semibold text-text-primary">BhashaAgent</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8F8EC] text-success">
                Connected
              </span>
            </div>

            {/* User Profile Card */}
            <div className="bg-card rounded-lg border border-divider p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                <User className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">{user.fullName}</p>
                <p className="text-[11px] text-text-secondary truncate">{user.email}</p>
              </div>
            </div>

            {/* Open Side Panel CTA */}
            <div>
              <button
                type="button"
                onClick={handleOpenSidePanel}
                disabled={isOpening}
                className="w-full h-9 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors flex items-center justify-center gap-1.5 focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isOpening ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Opening...</span>
                  </>
                ) : (
                  <>
                    <span>Open Side Panel</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
              {openError && (
                <p className="text-[11px] text-error mt-1.5 text-center leading-tight">
                  {openError}
                </p>
              )}
            </div>
          </div>

          {/* Footer with sign out */}
          <div className="pt-3 border-t border-divider">
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full h-8 rounded-md bg-page-bg border border-divider text-xs text-text-secondary hover:text-error hover:bg-white transition-colors flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </PopupLayout>
    );
  }

  // Unauthenticated View
  return (
    <PopupLayout>
      <div className="flex-1 flex flex-col justify-between">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-divider">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white">
              <Languages className="w-3.5 h-3.5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xs font-semibold text-text-primary leading-tight">BhashaAgent</h1>
              <p className="text-[10px] text-text-secondary">Multilingual Assistant</p>
            </div>
          </div>

          {/* Forms */}
          {authView === 'login' ? (
            <LoginForm onNavigateToRegister={() => setAuthView('register')} />
          ) : (
            <RegisterForm onNavigateToLogin={() => setAuthView('login')} />
          )}
        </div>
      </div>
    </PopupLayout>
  );
}
