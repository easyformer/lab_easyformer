import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: [
      'localhost',
      '*.ts.net' // Allow all Tailscale domains
    ]
  },
  envDir: '.',
  envPrefix: 'VITE_'
});
