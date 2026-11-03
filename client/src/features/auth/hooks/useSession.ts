import { useAuth } from './useAuth';

/**
 * Hook providing read-only session inspection.
 */
export function useSession() {
  const { user, status, isAuthenticated, isLoading } = useAuth();
  return {
    user,
    status,
    isAuthenticated,
    isLoading,
  };
}
