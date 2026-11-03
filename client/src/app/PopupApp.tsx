import { RouterProvider } from 'react-router-dom';
import { createPopupRouter } from './router.ts';
import { AppProviders } from './providers/AppProviders';

const router = createPopupRouter();

/**
 * Root application component for the Popup entry point.
 * Uses the popup-specific router with shared providers.
 */
export default function PopupApp() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
