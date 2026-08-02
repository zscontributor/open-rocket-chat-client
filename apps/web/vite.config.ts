import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

/**
 * Keeps a failing proxied request from taking the dev server down with it.
 *
 * When the upstream response cannot be parsed, Vite ends the browser-facing
 * response while the upstream stream is still flowing into it. The writes that
 * follow fail with `ERR_STREAM_WRITE_AFTER_END`, and Node turns an `error`
 * event with no listener into an uncaught exception — so one malformed reply
 * from the gateway kills `vite`, mid-session, with no route back except
 * restarting it. Listening is the whole fix: the request still fails, but it
 * fails alone.
 */
const surviveProxyErrors: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyRes', (proxyRes, _req, res) => {
    res.on('error', () => proxyRes.destroy());
    proxyRes.on('error', () => res.destroyed || res.destroy());
  });

  proxy.on('error', (_error, _req, target) => {
    // `target` is the client response for HTTP and the raw socket for
    // WebSocket upgrades; both answer to `destroy`.
    if (target && 'destroy' in target && !target.destroyed) target.destroy();
  });
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayUrl = env.VITE_GATEWAY_URL || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // Mirrors the `paths` entry in tsconfig.json; TypeScript resolves it for
      // typechecking, but the bundler needs telling separately.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // Proxying in development keeps the gateway same-origin, so the session
      // cookie needs neither `SameSite=None` nor HTTPS to be sent. Production
      // builds talk to the gateway directly via `VITE_GATEWAY_URL`.
      proxy: {
        '/api': { target: gatewayUrl, changeOrigin: false, configure: surviveProxyErrors },
        '/ws': { target: gatewayUrl, ws: true, changeOrigin: false, configure: surviveProxyErrors },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
