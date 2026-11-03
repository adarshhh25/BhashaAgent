import { AlertCircle } from 'lucide-react';

interface AuthErrorProps {
  message: string | null;
}

export function AuthError({ message }: AuthErrorProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 p-3 rounded-md bg-[#FFF2F4] border border-[#FFD0D6] text-error text-xs leading-relaxed"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}
