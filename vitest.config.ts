import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    css: true,
    env: {
      VITE_PRIVY_APP_ID: "test-privy-app-id",
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'src/test/**',
        'src/integrations/supabase/types.ts', // Auto-generated
      ],
      include: [
        'src/lib/config/network-config.ts',
        'src/hooks/useNetworkConfigs.ts',
        'src/components/create-event/TicketSettings.tsx',
        'src/utils/lockUtils.ts',
        'src/pages/AdminNetworks.tsx',
        'src/**/*.{ts,tsx}',
        'supabase/functions/_shared/**/*.ts',
      ],
    },
  },
});
