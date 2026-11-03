import type { ReactNode } from 'react';
import { Languages } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex flex-col min-h-full h-full bg-page-bg items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Brand identity */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-11 h-11 rounded-lg bg-accent flex items-center justify-center shadow-xs">
            <Languages className="w-6 h-6 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary tracking-tight">
              BhashaAgent
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Multilingual Browser Assistant
            </p>
          </div>
        </div>

        {/* Card container */}
        <div className="bg-card rounded-lg border border-divider shadow-xs p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <p className="text-xs text-text-secondary">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
