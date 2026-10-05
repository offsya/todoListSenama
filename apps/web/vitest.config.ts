import { defaultClientConditions } from 'vite';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Resolve packages like the browser build does. Otherwise react-router loads its CommonJS
    // build here, whose `react-router/dom` requires the ESM build under Node 24 ("module-sync"):
    // two copies of the router context and "useLocation() may be used only in a <Router>".
    resolve: { conditions: [...defaultClientConditions] },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
