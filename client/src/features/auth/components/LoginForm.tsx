import { useState, type FormEvent } from 'react';
import { Mail, Loader2, ArrowRight } from 'lucide-react';
import { PasswordField } from './PasswordField';
import { AuthError } from './AuthError';
import { useAuth } from '../hooks/useAuth';
import { ApiError, NetworkError } from '../../../services/api/api-errors';

interface LoginFormProps {
  onNavigateToRegister: () => void;
  onSuccess?: () => void;
}

export function LoginForm({ onNavigateToRegister, onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: trimmedEmail, password });
      onSuccess?.();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          setErrorMessage('Invalid email or password');
        } else if (error.status === 403) {
          setErrorMessage('This account is not active. Please contact support.');
        } else if (error.status === 429) {
          setErrorMessage('Too many login attempts. Please wait a few minutes before trying again.');
        } else {
          setErrorMessage(error.message || 'Login failed. Please check your credentials.');
        }
      } else if (error instanceof NetworkError) {
        setErrorMessage('Cannot reach the BhashaAgent server. Please verify your connection.');
      } else {
        setErrorMessage('An unexpected error occurred during sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <AuthError message={errorMessage} />

      {/* Email input */}
      <div className="flex flex-col gap-1.5 w-full">
        <label htmlFor="login-email" className="text-xs font-medium text-text-primary">
          Email address
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-text-placeholder pointer-events-none flex items-center">
            <Mail className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            disabled={isSubmitting}
            autoComplete="email"
            className="w-full h-10 pl-9 pr-3 bg-input-bg border border-input-border rounded-md text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50"
          />
        </div>
      </div>

      {/* Password input */}
      <PasswordField
        id="login-password"
        name="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        label="Password"
        disabled={isSubmitting}
        autoComplete="current-password"
      />

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-10 mt-1 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <span>Sign in</span>
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </>
        )}
      </button>

      {/* Toggle to Register */}
      <div className="flex items-center justify-center pt-2 border-t border-divider text-xs text-text-secondary">
        <span>Don&apos;t have an account?</span>
        <button
          type="button"
          onClick={onNavigateToRegister}
          disabled={isSubmitting}
          className="ml-1 text-accent font-medium hover:underline focus:outline-none"
        >
          Create one
        </button>
      </div>
    </form>
  );
}
