import '@testing-library/jest-dom';
import { createLogger, setLogger } from '../lib/log/logger';

// Component and unit tests stay quiet; tests that check logging install their own logger.
setLogger(createLogger({ level: 'silent' }));
