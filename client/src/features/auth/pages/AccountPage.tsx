import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Globe,
  KeyRound,
  LogOut,
  ShieldAlert,
  Trash2,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PasswordField } from '../components/PasswordField';
import { AuthError } from '../components/AuthError';
import { ApiError } from '../../../services/api/api-errors';
import SidePanelLayout from '../../../layouts/SidePanelLayout';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
];

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, logout, logoutAll, updateProfile, changePassword, deleteAccount } = useAuth();

  // Profile update state
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
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
      // Password change revokes all tokens; user redirected to login
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

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Current password is required');
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
    if (!window.confirm('Are you sure you want to log out from all devices?')) return;
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
      <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full">
        {/* Navigation header */}
        <div className="flex items-center justify-between pb-2 border-b border-divider">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Assistant</span>
          </button>
          <span className="text-xs font-semibold text-text-primary">Account</span>
        </div>

        {/* Profile Card */}
        <div className="bg-card rounded-lg border border-divider p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <User className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{user?.fullName}</h2>
              <div className="flex items-center gap-1 text-xs text-text-secondary">
                <Mail className="w-3 h-3 text-text-placeholder" />
                <span>{user?.email}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="flex flex-col gap-2.5 mt-2 pt-3 border-t border-divider">
            <AuthError message={profileError} />
            {profileSuccess && (
              <div className="flex items-center gap-2 p-2 rounded bg-[#E8F8EC] text-success text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="acc-name" className="text-xs font-medium text-text-primary">
                Full name
              </label>
              <input
                id="acc-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isUpdatingProfile}
                className="h-8 px-2.5 bg-input-bg border border-input-border rounded text-xs text-text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="acc-lang" className="text-xs font-medium text-text-primary">
                Primary language
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-2.5 text-text-placeholder pointer-events-none">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <select
                  id="acc-lang"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  disabled={isUpdatingProfile}
                  className="w-full h-8 pl-8 pr-2.5 bg-input-bg border border-input-border rounded text-xs text-text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="self-end mt-1 h-7 px-3 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isUpdatingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              <span>Save Changes</span>
            </button>
          </form>
        </div>

        {/* Security / Password Card */}
        <div className="bg-card rounded-lg border border-divider p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" strokeWidth={1.75} />
              <h3 className="text-xs font-semibold text-text-primary">Password & Security</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswordSection((p) => !p)}
              className="text-xs text-accent hover:underline focus:outline-none"
            >
              {showPasswordSection ? 'Cancel' : 'Change password'}
            </button>
          </div>

          {showPasswordSection && (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2.5 pt-2 border-t border-divider">
              <AuthError message={passwordError} />

              <p className="text-[11px] text-text-secondary">
                Changing your password will sign you out of all devices.
              </p>

              <PasswordField
                id="acc-current-pw"
                name="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                label="Current password"
                disabled={isChangingPassword}
              />

              <PasswordField
                id="acc-new-pw"
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                label="New password"
                hint="Min 12 characters"
                disabled={isChangingPassword}
                autoComplete="new-password"
              />

              <PasswordField
                id="acc-confirm-new-pw"
                name="confirmNewPassword"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                label="Confirm new password"
                disabled={isChangingPassword}
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={isChangingPassword}
                className="self-end mt-1 h-7 px-3 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isChangingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                <span>Update Password</span>
              </button>
            </form>
          )}
        </div>

        {/* Sessions & Logout Card */}
        <div className="bg-card rounded-lg border border-divider p-4 flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-text-primary">Sessions</h3>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut || isLoggingOutAll}
              className="w-full h-8 px-3 rounded border border-divider bg-page-bg text-text-primary text-xs font-medium hover:bg-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5 text-text-secondary" />}
              <span>Sign Out</span>
            </button>

            <button
              type="button"
              onClick={handleLogoutAll}
              disabled={isLoggingOut || isLoggingOutAll}
              className="w-full h-8 px-3 rounded border border-divider bg-page-bg text-text-secondary text-xs font-medium hover:text-error hover:bg-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isLoggingOutAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              <span>Sign Out of All Devices</span>
            </button>
          </div>
        </div>

        {/* Danger Zone: Account Deletion */}
        <div className="bg-card rounded-lg border border-[#FFD0D6] p-4 flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-error flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Danger Zone</span>
          </h3>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Permanently delete your account, memories, form tasks, and conversation history. This cannot be undone.
          </p>

          {!showDeleteModal ? (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="self-start mt-1 h-7 px-2.5 rounded border border-[#FFD0D6] text-error text-xs font-medium hover:bg-[#FFF2F4] transition-colors"
            >
              Delete Account
            </button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="flex flex-col gap-2.5 pt-2 border-t border-[#FFD0D6]">
              <AuthError message={deleteError} />

              <p className="text-[11px] text-error font-medium">
                Type <strong>DELETE</strong> to confirm permanent deletion:
              </p>

              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                disabled={isDeleting}
                className="h-8 px-2.5 bg-input-bg border border-input-border rounded text-xs text-text-primary focus:bg-white focus:outline-none focus:border-error"
              />

              <PasswordField
                id="del-pw"
                name="deletePassword"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                label="Confirm with your password"
                disabled={isDeleting}
              />

              <div className="flex items-center gap-2 self-end mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteError(null);
                  }}
                  disabled={isDeleting}
                  className="h-7 px-2.5 rounded border border-divider text-xs text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteConfirmation !== 'DELETE' || !deletePassword}
                  className="h-7 px-3 rounded bg-error text-white text-xs font-medium hover:bg-error/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  <span>Permanently Delete</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </SidePanelLayout>
  );
}
