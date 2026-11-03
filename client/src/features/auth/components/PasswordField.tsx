import { useState, type ChangeEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordFieldProps {
  id: string;
  name: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  error?: string;
  hint?: string;
}

export function PasswordField({
  id,
  name,
  value,
  onChange,
  label = 'Password',
  placeholder = '••••••••••••',
  required = true,
  disabled = false,
  autoComplete = 'current-password',
  error,
  hint,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-text-primary">
          {label}
        </label>
        {hint && <span className="text-[11px] text-text-placeholder">{hint}</span>}
      </div>

      <div className="relative flex items-center">
        <div className="absolute left-3 text-text-placeholder pointer-events-none flex items-center">
          <Lock className="w-4 h-4" strokeWidth={1.75} />
        </div>

        <input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`w-full h-10 pl-9 pr-10 bg-input-bg border rounded-md text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50 ${
            error ? 'border-error' : 'border-input-border'
          }`}
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          disabled={disabled}
          className="absolute right-2.5 p-1 rounded text-text-placeholder hover:text-text-primary focus:outline-none transition-colors"
          title={showPassword ? 'Hide password' : 'Show password'}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOff className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <Eye className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {error && <p className="text-[11px] text-error mt-0.5">{error}</p>}
    </div>
  );
}
