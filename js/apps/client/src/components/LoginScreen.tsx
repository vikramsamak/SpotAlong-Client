import { FormEvent, useEffect, useState } from 'react';
import { useSpotAlongStore } from '../store/useSpotAlongStore';
import { api } from '../services/api';

type Mode = 'idle' | 'oauth' | 'callback' | 'manual';

const REDIRECT_URI_KEY = 'spotalong.redirect_uri';

export default function LoginScreen() {
  const initializeSession = useSpotAlongStore((s) => s.initializeSession);
  const setAuthError = useSpotAlongStore((s) => s.setAuthError);
  const authError = useSpotAlongStore((s) => s.authError);

  const [mode, setMode] = useState<Mode>('idle');
  const [manualCode, setManualCode] = useState('');
  const [manualToken, setManualToken] = useState('');

  // Handle OAuth redirect back from Spotify (?code=...&state=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    setMode('callback');
    window.history.replaceState({}, '', window.location.pathname);

    const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY) ?? undefined;
    sessionStorage.removeItem(REDIRECT_URI_KEY);

    (async () => {
      try {
        const callback = await api.spotifyCallback(code, state, redirectUri);
        const redeemed = await api.redeemLoginCode(callback.code);
        initializeSession(redeemed.accessToken, redeemed.refreshToken);
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
      sessionStorage.setItem(REDIRECT_URI_KEY, login.redirect_uri);
      window.location.href = login.authUrl;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not start login');
      setMode('idle');
    }
  };

  const redeemManual = async (e: FormEvent) => {
    e.preventDefault();
    const value = manualCode.trim() || manualToken.trim();
    if (!value) return;
    setMode('callback');
    try {
      if (manualToken.trim()) {
        initializeSession(manualToken.trim());
        return;
      }
      const redeemed = await api.redeemLoginCode(value);
      initializeSession(redeemed.accessToken, redeemed.refreshToken);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Invalid code');
      setMode('manual');
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

      <button
        type="button"
        className="login-secondary"
        onClick={() => setMode(mode === 'manual' ? 'idle' : 'manual')}
      >
        Enter code manually
      </button>

      {mode === 'manual' && (
        <form onSubmit={redeemManual} className="login-manual">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="6-digit login code"
            maxLength={6}
            inputMode="numeric"
          />
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="...or paste an access token"
          />
          <button type="submit" disabled={!manualCode.trim() && !manualToken.trim()}>
            Connect
          </button>
        </form>
      )}
    </div>
  );
}
