import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` serves over HTTPS with a self-signed certificate so
// phones on the LAN get tilt controls and screen wake lock.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [react(), basicSsl()] : [react()],
  server: {
    host: true, // Expose to LAN (0.0.0.0) for phones
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
}));
