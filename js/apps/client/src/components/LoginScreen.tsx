import { useEffect, useRef, useState } from 'react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { api } from '../services/api';

type Mode = 'idle' | 'oauth' | 'callback';

export default function LoginScreen() {
  const initializeSession = useSpotAlongStore((s) => s.initializeSession);
  const setAuthError = useSpotAlongStore((s) => s.setAuthError);
  const authError = useSpotAlongStore((s) => s.authError);

  const [mode, setMode] = useState<Mode>('idle');
  const exchangedRef = useRef(false);

  // Handle the OAuth redirect back from Spotify (?code=...&state=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    window.history.replaceState({}, '', window.location.pathname);
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    setMode('callback');
    (async () => {
      try {
        const result = await api.spotifyCallback(code, state);
        initializeSession(result.accessToken, result.refreshToken);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Login failed');
        setMode('idle');
      }
    })();
  }, [initializeSession, setAuthError]);

  const startOAuth = async () => {
    setMode('oauth');
    try {
      const login = await api.initiateLogin();
      window.location.href = login.authUrl;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not start login');
      setMode('idle');
    }
  };

  if (mode === 'callback') {
    return (
      <div className="login-screen">
        <h1>SpotAlong</h1>
        <p>Signing you in...</p>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <h1>SpotAlong</h1>
      <p>Sign in to see what your friends are listening to</p>
      {authError && <p className="login-error">{authError}</p>}

      <button className="login-primary" onClick={startOAuth} disabled={mode === 'oauth'}>
        {mode === 'oauth' ? 'Redirecting...' : 'Sign in with Spotify'}
      </button>
    </div>
  );
}