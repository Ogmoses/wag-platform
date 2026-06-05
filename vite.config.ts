// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Allow env vars to be read without import.meta.env stripping
    'import.meta.env.VITE_SUPABASE_URL':  JSON.stringify(process.env.VITE_SUPABASE_URL  ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON': JSON.stringify(process.env.VITE_SUPABASE_ANON ?? ''),
  },
  build: {
    target:       'es2020',
    outDir:       'dist',
    sourcemap:    false,
    minify:       'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port:  3000,
    open:  false,
    https: false,
  },
});
