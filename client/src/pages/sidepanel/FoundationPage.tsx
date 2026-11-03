import { useNavigate } from 'react-router-dom';
import { Languages, User, LogOut } from 'lucide-react';
import SidePanelLayout from '../../layouts/SidePanelLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';

/**
 * Foundation Page for the Side Panel.
 * Shows authenticated user info, account shortcut, and logout.
 * Will be replaced by full conversation interface in FE-3.
 */
export default function FoundationPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <SidePanelLayout>
      <div className="flex-1 flex flex-col items-center justify-center p-panel gap-6">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center shadow-xs">
            <Languages className="w-6 h-6 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary leading-tight">
              BhashaAgent
            </h1>
            <p className="text-sm text-text-secondary">
              Multilingual AI Assistant
            </p>
          </div>
        </div>

        {/* Authenticated user status card */}
        <div className="w-full max-w-sm rounded-lg bg-card border border-divider p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <User className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-text-primary leading-tight">
                  {user?.fullName ?? 'Authenticated User'}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {user?.email}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8F8EC] text-success">
              Active
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-divider">
            <button
              type="button"
              onClick={() => navigate('/account')}
              className="flex-1 h-8 rounded-md bg-page-bg border border-divider text-xs font-medium text-text-primary hover:bg-white transition-colors"
            >
              Account Settings
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign Out"
              className="h-8 px-2.5 rounded-md bg-page-bg border border-divider text-xs text-text-secondary hover:text-error hover:bg-white transition-colors flex items-center justify-center"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Phase notice */}
        <p className="text-xs text-text-placeholder">
          FE-2 Authentication Ready • Awaiting FE-3 Conversation UI
        </p>
      </div>
    </SidePanelLayout>
  );
}
