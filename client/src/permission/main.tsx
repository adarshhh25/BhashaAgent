import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PermissionPage } from './PermissionPage';
import '../index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <PermissionPage />
    </StrictMode>,
  );
}

