import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './core/i18n';
import App from './App';
import { initializeRuntimeConfig, envCompile } from './core/config/runtime-config';
import { initAppLogger } from './core/logging/app-logger';

// Initialize runtime configuration FIRST (mirrors main.dart order)
initializeRuntimeConfig();
initAppLogger();
console.debug('🔧 Runtime configuration loaded');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

void envCompile;
