import type { ReactNode } from 'react';
import { AuthProvider } from '../../features/auth/context/AuthContext';
import { ConversationProvider } from '../../features/conversations/context/ConversationProvider';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Global application providers wrapper.
 *
 * FE-2: AuthProvider manages authentication across Side Panel and Popup.
 * FE-3: ConversationProvider manages conversation lifecycle, active chat, and agent turns.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <ConversationProvider>{children}</ConversationProvider>
    </AuthProvider>
  );
}
