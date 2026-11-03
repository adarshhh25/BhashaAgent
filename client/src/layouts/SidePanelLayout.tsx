import type { ReactNode } from 'react';

interface SidePanelLayoutProps {
  children: ReactNode;
}

/**
 * Layout wrapper for the Side Panel.
 *
 * Provides the full-height flex container that fills the Chrome Side Panel viewport.
 * Future phases will add navigation, header, and status bar here.
 */
export default function SidePanelLayout({ children }: SidePanelLayoutProps) {
  return (
    <div className="flex flex-col min-h-full h-full bg-page-bg">
      {/* Future: Header / Navigation bar */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {children}
      </main>
      {/* Future: Status bar / Voice controls */}
    </div>
  );
}

