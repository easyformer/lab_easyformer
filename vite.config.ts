import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['main-laptop.tailacac2.ts.net']
  },
  envDir: '.',
  envPrefix: 'VITE_'
});
