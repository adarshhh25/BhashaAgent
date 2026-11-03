import { createElement } from 'react';
import { createMemoryRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { RouteLoadingFallback } from '../components/RouteLoadingFallback';

/**
 * Side Panel route definitions.
 *
 * Public routes:
 * - /login      → LoginPage
 * - /register   → RegisterPage
 *
 * Protected routes (require valid authenticated session):
 * - /           → ConversationPage (Main Conversation Interface - FE-3)
 * - /conversations → ConversationPage
 * - /conversations/:conversationId → ConversationPage
 * - /account    → AccountPage (Profile & Security)
 * - /memory     → MemoryPage (FE-4 Profile Memory)
 * - /forms      → FormIntelligencePage (FE-5 Form Intelligence)
 * - /settings   → AccountPage
 */

const LoginPage = async () => {
  const mod = await import('../features/auth/pages/LoginPage');
  return { Component: mod.default };
};

const RegisterPage = async () => {
  const mod = await import('../features/auth/pages/RegisterPage');
  return { Component: mod.default };
};

const AccountPage = async () => {
  const mod = await import('../features/auth/pages/AccountPage');
  return { Component: mod.default };
};

const ConversationPage = async () => {
  const mod = await import('../features/conversations/pages/ConversationPage');
  return { Component: mod.default };
};

const MemoryPage = async () => {
  const mod = await import('../features/memory/pages/MemoryPage');
  return { Component: mod.default };
};

const FormIntelligencePage = async () => {
  const mod = await import('../features/forms/pages/FormIntelligencePage');
  return { Component: mod.default };
};

const ProtectedLayout = async () => {
  const { ProtectedRoute } = await import('../components/layout/ProtectedRoute');
  return {
    Component: () => createElement(ProtectedRoute, null, createElement(Outlet)),
  };
};

const sidePanelRoutes: RouteObject[] = [
  {
    HydrateFallback: RouteLoadingFallback,
    children: [
      // Public routes
      {
        path: '/login',
        lazy: LoginPage,
      },
      {
        path: '/register',
        lazy: RegisterPage,
      },
      {
        path: '/auth',
        element: createElement(Navigate, { to: '/login', replace: true }),
      },

      // Protected routes wrapped in ProtectedLayout
      {
        lazy: ProtectedLayout,
        children: [
          {
            path: '/',
            lazy: ConversationPage,
          },
          {
            path: '/conversations',
            lazy: ConversationPage,
          },
          {
            path: '/conversations/:conversationId',
            lazy: ConversationPage,
          },
          {
            path: '/account',
            lazy: AccountPage,
          },
          {
            path: '/memory',
            lazy: MemoryPage,
          },
          {
            path: '/forms',
            lazy: FormIntelligencePage,
          },
          {
            path: '/forms/:taskId',
            lazy: FormIntelligencePage,
          },
          {
            path: '/settings',
            lazy: AccountPage,
          },
        ],
      },
    ],
  },
];

/**
 * Use MemoryRouter for Chrome Extension environments.
 */
export function createSidePanelRouter() {
  return createMemoryRouter(sidePanelRoutes, {
    initialEntries: ['/'],
  });
}

/**
 * Popup routes.
 */
const PopupPage = async () => {
  const mod = await import('../pages/popup/PopupPage');
  return { Component: mod.default };
};

const popupRoutes: RouteObject[] = [
  {
    path: '/',
    lazy: PopupPage,
    HydrateFallback: RouteLoadingFallback,
  },
];

export function createPopupRouter() {
  return createMemoryRouter(popupRoutes, {
    initialEntries: ['/'],
  });
}
