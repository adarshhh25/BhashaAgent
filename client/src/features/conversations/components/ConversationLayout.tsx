import { type ReactNode } from 'react';

interface ConversationLayoutProps {
  sidebar: ReactNode;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  children: ReactNode;
}

export function ConversationLayout({
  sidebar,
  isSidebarOpen,
  onCloseSidebar,
  children,
}: ConversationLayoutProps) {
  return (
    <div className="relative flex h-full w-full max-h-screen max-w-full overflow-hidden bg-page-bg">
      {/* Mobile / Narrow Drawer Backdrop */}
      {isSidebarOpen && (
        <div
          role="presentation"
          onClick={onCloseSidebar}
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-xs transition-opacity md:hidden"
        />
      )}

      {/* Sidebar Drawer / Column */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0 shadow-xl md:shadow-none' : '-translate-x-full md:hidden'
        }`}
      >
        {sidebar}
      </div>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-page-bg relative">
        {children}
      </main>
    </div>
  );
}

