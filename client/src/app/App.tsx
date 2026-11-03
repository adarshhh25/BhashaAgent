import { RouterProvider } from 'react-router-dom';
import { createSidePanelRouter } from './router.ts';
import { AppProviders } from './providers/AppProviders';

const router = createSidePanelRouter();

/**
 * Root application component for the Side Panel entry point.
 * Wraps the router with global providers.
 */
export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
