import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronDown,
  User,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../../../services/api/api-errors';
import SidePanelLayout from '../../../layouts/SidePanelLayout';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'mr', label: 'Marathi' },
  { code: 'hinglish', label: 'Hinglish' },
];

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return '1 month ago';
    if (diffMonths < 12) return `${diffMonths} months ago`;
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently';
  }
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, logout, logoutAll, updateProfile, changePassword, deleteAccount } = useAuth();

  // Profile update state
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password & Security expansion state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Delete account confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Logout state
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const trimmed = fullName.trim();
    if (!trimmed) {
      setProfileError('Full name cannot be empty');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      await updateProfile({ fullName: trimmed, preferredLanguage });
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      // Password change revokes existing sessions; navigate to login
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setPasswordError('Current password is incorrect');
      } else {
        setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
      }
      setIsChangingPassword(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError('Please enter your current password to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAccount({ currentPassword: deletePassword, confirmation: 'DELETE' });
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setDeleteError('Current password is incorrect');
      } else {
        setDeleteError(error instanceof Error ? error.message : 'Failed to delete account');
      }
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true);
    try {
      await logoutAll();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOutAll(false);
    }
  };

  return (
    <SidePanelLayout>
      <div className="flex flex-col min-h-screen bg-[#F7F6F1]">
        {/* Navigation Header (Screenshot 3 & Screenshot 1 top) */}
        <header className="h-12 border-b border-divider/60 bg-[#F7F6F1] px-4 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-[#7B8278] hover:text-[#102A24] font-medium transition-colors focus:outline-none"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Assistant</span>
          </button>
          <h1 className="text-xs sm:text-sm font-bold text-[#102A24]">Account</h1>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-3.5 sm:p-4 max-w-md mx-auto w-full flex flex-col gap-3.5">
          {/* Profile Feedback Notifications */}
          {profileSuccess && (
            <div className="p-2.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}
          {profileError && (
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          {/* Section 1: Profile Information Card (Screenshot 3) */}
          <div className="bg-card border border-divider rounded-2xl p-4 shadow-2xs flex flex-col gap-3.5">
            {/* Identity top section */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#DCE7DC] flex items-center justify-center text-[#17483A] shrink-0">
                <User className="w-6 h-6 stroke-[1.75]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#102A24] truncate">
                  {user?.fullName || 'User'}
                </h2>
                <p className="text-xs text-[#7B8278] truncate mt-0.5">
                  {user?.email}
                </p>
              </div>
            </div>

            {/* Profile fields form */}
            <form onSubmit={handleUpdateProfile} className="flex flex-col gap-3 pt-3 border-t border-divider/60">
              <div className="flex flex-col gap-1">
                <label htmlFor="acc-fullname" className="text-xs font-semibold text-[#102A24]">
                  Full name
                </label>
                <input
                  id="acc-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isUpdatingProfile}
                  placeholder="Your full name"
                  className="w-full h-9 px-3 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] focus:outline-none focus:border-[#102A24] focus:ring-1 focus:ring-[#102A24] transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="acc-lang" className="text-xs font-semibold text-[#102A24]">
                  Primary language
                </label>
                <div className="relative flex items-center">
                  <select
                    id="acc-lang"
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    disabled={isUpdatingProfile}
                    className="w-full h-9 px-3 pr-8 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] appearance-none focus:outline-none focus:border-[#102A24] focus:ring-1 focus:ring-[#102A24] transition-all cursor-pointer"
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#7B8278] pointer-events-none absolute right-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="self-end mt-1 h-8 px-4 rounded-xl bg-[#102A24] hover:bg-[#17483A] text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isUpdatingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Save Changes</span>
              </button>
            </form>
          </div>

          {/* Section 2: Password & Security (Screenshot 3 Collapsed / Screenshot 2 Expanded) */}
          {!showPasswordSection ? (
            /* Collapsed State (Screenshot 3) */
            <div className="bg-card border border-divider rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] flex items-center justify-center text-[#17483A] shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#102A24]">Password & Security</h3>
                  <p className="text-[11px] text-[#7B8278] mt-0.5">
                    {user?.updatedAt ? `Updated ${formatRelativeTime(user.updatedAt)}` : 'Secure your account'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordSection(true)}
                className="h-7 px-3.5 rounded-lg bg-[#F7F6F1] border border-divider text-xs font-semibold text-[#102A24] hover:bg-white hover:border-[#102A24]/30 transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            /* Expanded State (Screenshot 2) */
            <div className="bg-card border border-divider rounded-2xl p-4 shadow-2xs flex flex-col gap-3 animate-in fade-in duration-150">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#102A24]" />
                  <h3 className="text-xs font-bold text-[#102A24]">Password & Security</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSection(false);
                    setPasswordError(null);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }}
                  className="text-xs font-semibold text-[#102A24] hover:underline"
                >
                  Cancel
                </button>
              </div>

              {/* Supporting info text */}
              <p className="text-[11px] text-[#7B8278]">
                Changing your password will sign you out of all devices.
              </p>

              {passwordError && (
                <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="p-2.5 rounded-xl bg-success/10 border border-success/20 text-success text-xs">
                  {passwordSuccess}
                </div>
              )}

              {/* Expanded Form Fields */}
              <form onSubmit={handleChangePassword} className="flex flex-col gap-3 mt-0.5">
                {/* Current password */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#102A24]">Current password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-3.5 h-3.5 text-[#7B8278] absolute left-3 pointer-events-none" />
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={isChangingPassword}
                      placeholder="••••••••••••"
                      className="w-full h-9 pl-9 pr-9 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] focus:outline-none focus:border-[#102A24] focus:ring-1 focus:ring-[#102A24] transition-all"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowCurrentPassword((p) => !p)}
                      className="absolute right-3 text-[#7B8278] hover:text-[#102A24]"
                    >
                      {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#102A24]">New password</label>
                    <span className="text-[11px] text-[#7B8278]">Min 12 characters</span>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="w-3.5 h-3.5 text-[#7B8278] absolute left-3 pointer-events-none" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isChangingPassword}
                      placeholder="At least 12 characters"
                      className="w-full h-9 pl-9 pr-9 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] focus:outline-none focus:border-[#102A24] focus:ring-1 focus:ring-[#102A24] transition-all"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-3 text-[#7B8278] hover:text-[#102A24]"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm new password */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-[#102A24]">Confirm new password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-3.5 h-3.5 text-[#7B8278] absolute left-3 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={isChangingPassword}
                      placeholder="Re-enter new password"
                      className="w-full h-9 pl-9 pr-9 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] focus:outline-none focus:border-[#102A24] focus:ring-1 focus:ring-[#102A24] transition-all"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      className="absolute right-3 text-[#7B8278] hover:text-[#102A24]"
                    >
                      {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Update Password button */}
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="self-end mt-1 h-8 px-4 rounded-xl bg-[#102A24] hover:bg-[#17483A] text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Update Password</span>
                </button>
              </form>
            </div>
          )}

          {/* Section 3: Sessions Card (Screenshot 3 & Screenshot 2 bottom) */}
          <div className="bg-card border border-divider rounded-2xl p-4 shadow-2xs flex flex-col gap-2.5">
            <div>
              <h3 className="text-xs font-bold text-[#102A24]">Sessions</h3>
              <p className="text-[11px] text-[#7B8278] mt-0.5">Manage your active sign-ins</p>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut || isLoggingOutAll}
                className="w-full h-9 rounded-xl border border-divider bg-[#F7F6F1] text-xs font-semibold text-[#252923] hover:bg-white hover:border-[#252923]/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-[#252923]" />
                )}
                <span>Sign Out</span>
              </button>

              <button
                type="button"
                onClick={handleLogoutAll}
                disabled={isLoggingOut || isLoggingOutAll}
                className="w-full h-9 rounded-xl border border-divider bg-[#F7F6F1] text-xs font-semibold text-[#252923] hover:bg-white hover:border-[#252923]/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoggingOutAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>Sign Out of All Devices</span>
              </button>
            </div>
          </div>

          {/* Section 4: Danger Zone (Screenshot 3) */}
          <div className="bg-card border border-[#FFD0D6] rounded-2xl p-4 shadow-2xs flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[#E11D48]">
              <Trash2 className="w-3.5 h-3.5" />
              <h3 className="text-xs font-bold text-[#E11D48]">Danger Zone</h3>
            </div>

            <p className="text-[11px] text-[#7B8278] leading-relaxed">
              Permanently delete your account, memories, form tasks, and conversation history. This cannot be undone.
            </p>

            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteError(null);
                setDeletePassword('');
              }}
              className="self-start mt-1 h-8 px-3.5 rounded-xl border border-[#FFD0D6] text-[#E11D48] bg-white text-xs font-semibold hover:bg-red-50/50 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </main>

        {/* Modal: Delete Account Confirmation (Screenshot 1) */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-card w-full max-w-[320px] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center gap-3 border border-divider/40 animate-in zoom-in-95 duration-150"
            >
              {/* Circular pale-red icon */}
              <div className="w-12 h-12 rounded-full bg-[#FEE2E2]/70 flex items-center justify-center text-[#E11D48]">
                <Trash2 className="w-6 h-6 stroke-[1.75]" />
              </div>

              {/* Heading */}
              <h3 className="text-base font-bold text-[#102A24]">
                Delete Account?
              </h3>

              {/* Description */}
              <p className="text-xs text-[#7B8278] leading-relaxed max-w-[240px]">
                All your synced linguistic settings, profile data, and AI memories will be permanently wiped.
              </p>

              {/* Password Verification Field (preserves backend security requirement) */}
              <div className="w-full flex flex-col gap-1 mt-1 text-left">
                <label className="text-[11px] font-semibold text-[#102A24]">
                  Confirm with your password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-3.5 h-3.5 text-[#7B8278] absolute left-3 pointer-events-none" />
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={isDeleting}
                    placeholder="Current password"
                    className="w-full h-9 pl-9 pr-9 rounded-xl bg-input-bg border border-input-border text-xs text-[#102A24] focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowDeletePassword((p) => !p)}
                    className="absolute right-3 text-[#7B8278] hover:text-[#102A24]"
                  >
                    {showDeletePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {deleteError && (
                <div className="w-full p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] text-left">
                  {deleteError}
                </div>
              )}

              {/* Actions */}
              <div className="w-full flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  disabled={isDeleting || !deletePassword}
                  className="w-full h-10 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Permanently Delete Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  disabled={isDeleting}
                  className="w-full h-10 rounded-xl bg-[#F7F6F1] hover:bg-[#ECEAE3] text-[#252923] text-xs font-semibold transition-colors flex items-center justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidePanelLayout>
  );
}
