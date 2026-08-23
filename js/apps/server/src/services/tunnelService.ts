import type { Listener } from '@ngrok/ngrok';

let listener: Listener | null = null;
let publicUrl: string | null = null;

export function getPublicUrl(): string | null {
  return publicUrl;
}

/**
 * Opens an ngrok tunnel to the local HTTP server using an
 * automatically generated ngrok domain.
 *
 * Controlled via env:
 *   NGROK_ENABLED=true        opt-in flag (default false)
 *   NGROK_AUTHTOKEN=...       account authtoken (required unless set in ngrok config)
 *
 * Returns the public https URL, or null when disabled/failed.
 * The ngrok native module is only imported when the tunnel is enabled.
 */
export async function startTunnel(port: number): Promise<string | null> {
  if (process.env.NGROK_ENABLED !== 'true') return null;

  const authtoken = process.env.NGROK_AUTHTOKEN;

  try {
    const ngrok = await import('@ngrok/ngrok');
    listener = await ngrok.forward({
      addr: port,
      proto: 'http',
      ...(authtoken ? { authtoken } : { authtoken_from_env: true })
    });

    publicUrl = listener.url() ?? null;

    if (publicUrl) {
      console.log(`ngrok tunnel active: ${publicUrl} -> http://localhost:${port}`);
      console.log(
        `Set SPOTIFY_REDIRECT_URI to ${publicUrl}/api/login/callback and update it in the Spotify developer dashboard.`
      );
    }
    return publicUrl;
  } catch (error) {
    console.error('Failed to start ngrok tunnel:', error);
    listener = null;
    publicUrl = null;
    return null;
  }
}

export async function stopTunnel(): Promise<void> {
  if (!listener) return;
  try {
    await listener.close();
  } catch (error) {
    console.error('Error closing ngrok tunnel:', error);
  } finally {
    listener = null;
    publicUrl = null;
  }
}
