import { useState, type FormEvent } from 'react';
import { Mail, User, Globe, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { PasswordField } from './PasswordField';
import { AuthError } from './AuthError';
import { useAuth } from '../hooks/useAuth';
import { ApiError, NetworkError } from '../../../services/api/api-errors';

interface RegisterFormProps {
  onNavigateToLogin: (registeredEmail?: string) => void;
}

const SUPPORTED_LANGUAGES = [
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

export function RegisterForm({ onNavigateToLogin }: RegisterFormProps) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorMessage('Full name is required');
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage('Email address is required');
      return;
    }
    if (password.length < 12) {
      setErrorMessage('Password must be at least 12 characters');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        fullName: trimmedName,
        email: trimmedEmail,
        password,
        preferredLanguage: preferredLanguage || undefined,
      });

      setSuccessMessage('Account created successfully! Redirecting to sign in...');
      setTimeout(() => {
        onNavigateToLogin(trimmedEmail);
      }, 1500);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setErrorMessage('An account with that email already exists. Please sign in instead.');
        } else if (error.status === 400) {
          setErrorMessage(error.message || 'Validation error. Please verify your details.');
        } else if (error.status === 429) {
          setErrorMessage('Too many registration attempts. Please wait a few minutes.');
        } else {
          setErrorMessage(error.message || 'Registration failed. Please try again.');
        }
      } else if (error instanceof NetworkError) {
        setErrorMessage('Cannot reach the BhashaAgent server. Please verify your connection.');
      } else {
        setErrorMessage('An unexpected error occurred during registration.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <AuthError message={errorMessage} />

      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2.5 p-3 rounded-md bg-[#E8F8EC] border border-[#BCE8C5] text-success text-xs"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Full name input */}
      <div className="flex flex-col gap-1 w-full">
        <label htmlFor="reg-name" className="text-xs font-medium text-text-primary">
          Full name
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-text-placeholder pointer-events-none flex items-center">
            <User className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <input
            id="reg-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ada Lovelace"
            required
            disabled={isSubmitting}
            autoComplete="name"
            className="w-full h-9 pl-9 pr-3 bg-input-bg border border-input-border rounded-md text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
          />
        </div>
      </div>

      {/* Email input */}
      <div className="flex flex-col gap-1 w-full">
        <label htmlFor="reg-email" className="text-xs font-medium text-text-primary">
          Email address
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-text-placeholder pointer-events-none flex items-center">
            <Mail className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            disabled={isSubmitting}
            autoComplete="email"
            className="w-full h-9 pl-9 pr-3 bg-input-bg border border-input-border rounded-md text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
          />
        </div>
      </div>

      {/* Password input */}
      <PasswordField
        id="reg-password"
        name="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        label="Password"
        hint="Min 12 characters"
        disabled={isSubmitting}
        autoComplete="new-password"
      />

      {/* Confirm Password input */}
      <PasswordField
        id="reg-confirm-password"
        name="confirmPassword"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        label="Confirm password"
        disabled={isSubmitting}
        autoComplete="new-password"
      />

      {/* Preferred language input */}
      <div className="flex flex-col gap-1 w-full">
        <label htmlFor="reg-language" className="text-xs font-medium text-text-primary">
          Primary language
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-text-placeholder pointer-events-none flex items-center">
            <Globe className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <select
            id="reg-language"
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
            disabled={isSubmitting}
            className="w-full h-9 pl-9 pr-3 bg-input-bg border border-input-border rounded-md text-sm text-text-primary transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting || !!successMessage}
        className="w-full h-10 mt-1 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Creating account...</span>
          </>
        ) : (
          <>
            <span>Create account</span>
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </>
        )}
      </button>

      {/* Toggle to Login */}
      <div className="flex items-center justify-center pt-2 border-t border-divider text-xs text-text-secondary">
        <span>Already have an account?</span>
        <button
          type="button"
          onClick={() => onNavigateToLogin()}
          disabled={isSubmitting}
          className="ml-1 text-accent font-medium hover:underline focus:outline-none"
        >
          Sign in
        </button>
      </div>
    </form>
  );
}
