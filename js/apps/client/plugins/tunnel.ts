import type { Plugin } from 'vite';
import type { Listener } from '@ngrok/ngrok';

let listener: Listener | null = null;

/**
 * Opens an ngrok tunnel to the Vite dev server (web client) so external
 * clients can reach the app and its OAuth callback, which live on the client.
 *
 * Env-controlled (read from process.env at dev-server start):
 *   NGROK_ENABLED=true       opt-in flag (default: disabled)
 *   NGROK_AUTHTOKEN=...      account authtoken (required unless set in ngrok config)
 *   TUNNEL_TARGET_PORT       local port to expose (defaults to the Vite port)
 */
function tunnel(): Plugin {
  return {
    name: 'spotalong-tunnel',
    apply: 'serve',

    async configureServer(viteServer) {
      if (process.env.NGROK_ENABLED !== 'true') return;

      const authtoken = process.env.NGROK_AUTHTOKEN;
      const options = viteServer.config.server;
      const targetPort = Number(process.env.TUNNEL_TARGET_PORT ?? options.port ?? 5173);

      try {
        const ngrok = await import('@ngrok/ngrok');
        listener = await ngrok.forward({
          addr: targetPort,
          proto: 'http',
          ...(authtoken ? { authtoken } : { authtoken_from_env: true })
        });

        const publicUrl = listener.url() ?? null;
        if (publicUrl) {
          viteServer.config.logger.info(
            `ngrok tunnel active: ${publicUrl} -> http://localhost:${targetPort} (web client)`
          );
          viteServer.config.logger.info(
            `For login over this tunnel set SPOTIFY_REDIRECT_URI to ${publicUrl}/callback ` +
              `and update the matching Redirect URI in the Spotify developer dashboard.`
          );
        }
      } catch (error) {
        viteServer.config.logger.error(
          `Failed to start ngrok tunnel: ${error instanceof Error ? error.message : error}`
        );
      }
    },

    async closeBundle() {
      if (listener) {
        try {
          await listener.close();
        } catch (error) {
          console.error('Error closing ngrok tunnel:', error);
        } finally {
          listener = null;
        }
      }
    }
  };
}

export default tunnel;
