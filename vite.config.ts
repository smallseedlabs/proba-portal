import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  // Build-time only, and only for the automated browser checks: the in-memory data source is compiled into
  // the e2e build and nowhere else. Production images are built with the default ("http"), and
  // `npm run check:bundle` fails if anything of the in-memory source is found in the output.
  const inMemoryApi = env.VITE_API_ADAPTER === 'memory';

  return {
    plugins: [react()],
    define: {
      __IN_MEMORY_API__: JSON.stringify(inMemoryApi),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5174,
      host: true,
    },
    preview: {
      port: 5174,
      host: true,
    },
  };
});
