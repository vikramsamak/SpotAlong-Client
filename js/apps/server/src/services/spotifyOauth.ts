import axios from 'axios';

export interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  images: Array<{ url: string; height: number | null; width: number | null }> | null;
}

export class SpotifyOAuthService {
  static getAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing streaming app-remote-control',
      state: state
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  static async exchangeCode(code: string) {
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data as SpotifyTokenResponse;
  }

  static async getUserInfo(accessToken: string): Promise<SpotifyUserProfile | null> {
    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      return response.data as SpotifyUserProfile;
    } catch {
      return null;
    }
  }
}
