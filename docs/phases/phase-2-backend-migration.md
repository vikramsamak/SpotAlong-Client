# Phase 2: Express.js Backend & Database REST API Migration

This phase focuses on porting the **FastAPI REST API layer** to an **Express.js application** written in TypeScript. We will also transition from **async SQLAlchemy** to a modern, type-safe ORM like **Prisma** or **Drizzle** connected to MySQL.

---

## 1. Database Schema Migration (Prisma ORM)

We will translate the SQLAlchemy models in `server/models/` into a `schema.prisma` layout. This ensures full native type generation.

### 1.1 Prisma Schema (`apps/server/prisma/schema.prisma`)
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id                  String   @id @default(uuid())
  friendCode          String   @unique @map("friend_code") @db.VarChar(6)
  displayName         String   @map("display_name")
  username            String   @unique
  avatarUrl           String?  @map("avatar_url")
  
  // SpotAlong Session Tokens (JWT)
  accessToken         String?  @map("access_token") @db.Text
  refreshToken        String?  @map("refresh_token") @db.Text
  tokenExpiry         DateTime? @map("token_expiry")

  // Spotify Auth Tokens
  spotifyAccessToken  String?  @map("spotify_access_token") @db.Text
  spotifyRefreshToken String?  @map("spotify_refresh_token") @db.Text
  spotifyTokenExpiry  DateTime? @map("spotify_token_expiry")

  // Login Staging (OAuth State)
  spotifyState        String?  @map("spotify_state")
  loginCode           String?  @map("login_code") @db.VarChar(6)
  loginCodeExpiry     DateTime? @map("login_code_expiry")

  // Live Playback Cache
  lastOnline          DateTime? @map("last_online")
  lastSongId          String?  @map("last_song_id")
  lastProgress        Int?     @map("last_progress")
  lastIsPlaying       Boolean? @map("last_is_playing")

  // Privacy Settings
  privacyMode         String   @default("friends") @map("privacy_mode")

  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relations
  friends             Friend[] @relation("UserFriends")
  targetedFriends     Friend[] @relation("FriendTargets")

  @@map("users")
}

model Friend {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  friendId  String   @map("friend_id")
  direction String   // "sent" | "received"
  status    String   // "pending" | "accepted" | "declined"
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation("UserFriends", fields: [userId], references: [id], onDelete: Cascade)
  friend    User     @relation("FriendTargets", fields: [friendId], references: [id], onDelete: Cascade)

  @@unique([userId, friendId])
  @@map("friends")
}

model ListenSession {
  id         String   @id @default(uuid())
  listenerId String   @map("listener_id")
  targetId   String   @map("target_id")
  active     Boolean  @default(true)
  state      String?  @db.Text
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([listenerId, targetId])
  @@map("listen_sessions")
}

model CacheEntry {
  key       String   @id
  value     String   @db.Text // Store JSON objects or raw assets
  expiresAt DateTime @map("expires_at")

  @@index([expiresAt])
  @@map("cache_entries")
}
```

---

## 2. JWT and Security Middleware

FastAPI routes decoded tokens manually per route. In Express, we will implement a centralized authentication middleware.

### 2.1 Auth Middleware (`apps/server/src/middleware/auth.ts`)
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET!, (err, decoded: any) => {
      if (err || decoded.type !== 'access') {
        return res.status(401).json({ detail: 'Invalid or expired session token.' });
      }
      req.userId = decoded.sub;
      next();
    });
  } else {
    res.status(401).json({ detail: 'Authorization token missing.' });
  }
}
```

---

## 3. Router Porting

We will recreate the four modular router paths of SpotAlong inside the Express structure using Express Routers.

### 3.1 Auth Router (`apps/server/src/routes/auth.ts`)
Must preserve the exact multi-step code-redemption flow:
1. `GET /api/login`: Creates an anonymous `User` placeholder row on the fly to house the CSRF state and temporary 6-digit login code. Returns the Spotify authorization URL.
2. `GET /api/login/callback` (Redirect Target): Invoked by Spotify. Resolves the user by matching the custom `state`, exchanges code for Spotify API tokens, retrieves Spotify user profile, updates the staging row, and yields the 6-digit verification code.
3. `GET /api/login/redeem_code`: Redeems the verification code, generates the core SpotAlong JWTs, and marks the user session active.
4. `GET /api/login/eligible`: Verifies if an existing session token is active and unexpired.
5. `POST /api/login/refresh`: Single-session rotating token refresh logic.

### 3.2 Friends Router (`apps/server/src/routes/friends.ts`)
Emulates friend pairing behavior. A friendship consists of **two** mirrored database rows.
* `POST /api/friends/friend_request` (Body: `{ friend_code }`): Resolves the user by code, rejects requests to oneself or active friends, and generates two inverse "sent" / "received" pending rows.
* `POST /api/friends/remove_friend` (Body: `{ friend_code }`): Erases the bilateral friendship connections.
* `POST /api/friends/accept` & `POST /api/friends/decline` (Query: `requester_id`): Updates the status attribute on both corresponding friendship keys in the database.

### 3.3 Cache Router (`apps/server/src/routes/cache.ts`)
Operates as a read-through, caching proxy to lessen client-side payload sizes and keep external API traffic to a minimum.
* `GET /api/cache/colors/:album_id`: Pulls dominant color configurations.
* `GET /api/cache/album/:album_id`: Retreives cached, pre-feathered PNG data.
* `GET /api/cache/name/:song_uri`: Fetches song details.

---

## 4. Business Services Migration

The business layer is migrated into structured class architectures utilizing static dependencies.

### 4.1 Spotify OAuth Service (`apps/server/src/services/spotifyOauth.ts`)
Provides direct bindings to the accounts and client APIs of Spotify:
```typescript
import axios from 'axios';

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
    return response.data;
  }
}
```

---

## 5. Acceptance Criteria & Verification

To mark Phase 2 as complete, developers must:
1. Initialize the MySQL database with `npx prisma db push`.
2. Run unit tests on `/api/login` and `/api/friends` endpoints using `supertest` to confirm identical behavior with the legacy Python API.
3. Validate that JWT expiration yields correct status codes (`401 Unauthorized`) with matching error envelopes (`{ detail: string }`).
