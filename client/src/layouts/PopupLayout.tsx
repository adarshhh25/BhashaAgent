import type { ReactNode } from 'react';

interface PopupLayoutProps {
  children: ReactNode;
}

/**
 * Layout wrapper for the Chrome Extension Popup.
 *
 * Provides a compact, fixed-dimension container appropriate
 * for the popup overlay. Popup dimensions are typically 360×480px.
 */
export default function PopupLayout({ children }: PopupLayoutProps) {
  return (
    <div className="w-[360px] min-h-[480px] bg-page-bg flex flex-col">
      <main className="flex-1 flex flex-col p-panel overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

