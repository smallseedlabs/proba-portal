import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ToastProvider } from './components/ui/toast';
import { ConfigProvider, loadConfig } from './lib/config';
import { createLogger, parseLevel, setLogger, sinkFor } from './lib/log/logger';
import { TimeProvider } from './lib/time-context';

const startup = loadConfig();
const logger = createLogger({ level: parseLevel(startup.logLevel), sink: sinkFor(startup.logSink) });
setLogger(logger);
logger.info('app.started', { apiBaseUrl: startup.apiBaseUrl, signInConfigured: startup.firebase !== null, memoryEntry: startup.memoryUrl !== null });
window.addEventListener('error', (e) => logger.error('ui.uncaught_error', { message: e.message, source: e.filename, line: e.lineno }));
window.addEventListener('unhandledrejection', (e) => logger.error('ui.unhandled_rejection', { message: String((e.reason as Error | undefined)?.message ?? e.reason) }));

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <ConfigProvider>
        <TimeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </TimeProvider>
      </ConfigProvider>
    </AppErrorBoundary>
  </StrictMode>
);
