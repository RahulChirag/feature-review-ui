# Feature Explanation: Admin Portal Unified Auth

> Generated from actual code analysis. No assumptions made.
> Date: 2026-05-25

---

## What is this feature?

**Admin Portal Unified Auth** lets NeuroIQ Admin accept the **same login session as NeuroIQ Home** when `USE_AUTH_SERVICE=true`. Users sign in on Home (or via Auth Service); Auth Service sets HttpOnly cookies `neuroiq_at` and `neuroiq_rt`. Admin API validates `neuroiq_at` with **RS256 + JWKS** (via `neuroiq_auth_lib`), then loads the user from the **shared Admin database** by JWT `sub` (user id). Legacy Admin login (`/api/auth/login`, MSAL) remains available in parallel with **HS256** cookies `access_token` / `refresh_token`.

When the flag is **off**, behavior is unchanged: Admin-only cookies and Admin-only refresh.

---

## Architecture and key components

### Three repos, one session (when enabled)

| Repo | Role |
|------|------|
| **R-NeuroIQ-Auth-Service** | Issues RS256 JWTs, sets cookies, stores refresh sessions in DB, exposes JWKS |
| **R-NeuroIQ-Home** | Login UI, proxies `/auth` to Auth Service, app launcher |
| **R-NeuroIQ-Admin-Portal** | Validates cookies on `/api/*`, optional legacy login UI |

**Important:** Cookies are **not** read from the database on each request. The DB holds user rows and (in Auth Service) refresh **sessions**. Each API call validates the JWT in the cookie, then loads `User` by id from MySQL.

### Cookie families

| Cookies | Issuer | Algorithm | Used by Admin when |
|---------|--------|-----------|-------------------|
| `neuroiq_at`, `neuroiq_rt` | Auth Service | RS256 access + refresh | `USE_AUTH_SERVICE=true` |
| `access_token`, `refresh_token` | Admin `/api/auth/login` or MSAL | HS256 (Admin `jwt.py`) | Always (legacy path) |

Resolution order in `get_current_user`: **neuroiq first** (if flag on), then legacy.

### Backend (Admin Portal)

- `auth_integration.py` — reads repo-root `.env`; `use_auth_service()` requires **both** `USE_AUTH_SERVICE` and `VITE_USE_AUTH_SERVICE` to be true when both are set (AND), avoiding frontend/backend mismatch.
- `dependencies.py` — `get_current_user` dual path.
- `main.py` — on startup, if flag on: `configure_jwks(AUTH_SERVICE_URL)` from `neuroiq_auth_lib`.
- `auth.py` — `/me`, `/login`, `/refresh`, `/logout` unchanged routes; `/me` uses shared `get_current_user`.

### Frontend (Admin Portal)

- `vite.config.js` — `envDir` = repo root; proxy `/auth` → Auth Service; `envPrefix` includes `VITE_` and `USE_`.
- `runtimeConfig.js` — `getUseAuthService()`, `getHomeLoginUrl()` from `window.__APP_CONFIG__` or Vite env.
- `authServiceClient.js` — `POST /auth/refresh`, `/auth/logout` (proxied).
- `axios.js` — on 401: try Auth Service refresh, then `/api/auth/refresh`.
- `AuthContext.jsx` — logout calls both services, then **redirects to Home `/login` before** clearing React state (avoids flash of Admin login page).

### Auth Service (token + cookies)

- `POST /auth/db-login` — bcrypt login; requires Admin role for web db-login; sets cookies on `localhost` with `COOKIE_DOMAIN`.
- `token_service.py` — JWT claims: `sub` and `org_id` must be **strings** (PyJWT requirement); `typ: "access"`.
- `GET /auth/.well-known/jwks.json` — public keys for validators.

### Home

- `postDBLogin` → Auth Service `/auth/db-login`.
- Axios interceptor refreshes via `/auth/refresh` on 401.
- Launcher loads apps from `/auth/app-launcher/apps`; Admin card URL should point to local Admin (e.g. `http://localhost:5173`) with `open_in_new_tab=0` for same-tab navigation.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `R-NeuroIQ-Admin-Portal/backend/app/config/auth_integration.py` | Env loading, `use_auth_service()`, frontend config dict for injection |
| `R-NeuroIQ-Admin-Portal/backend/app/core/dependencies.py` | `get_current_user`, neuroiq vs legacy cookie resolution |
| `R-NeuroIQ-Admin-Portal/backend/app/main.py` | JWKS lifespan, `__APP_CONFIG__` in served `index.html` |
| `R-NeuroIQ-Admin-Portal/backend/app/routes/auth.py` | Legacy cookie set/clear on login/refresh/logout |
| `R-NeuroIQ-Admin-Portal/frontend/src/api/axios.js` | Dual refresh chain |
| `R-NeuroIQ-Admin-Portal/frontend/src/api/authServiceClient.js` | Auth Service refresh/logout client |
| `R-NeuroIQ-Admin-Portal/frontend/src/contexts/AuthContext.jsx` | Session bootstrap, unified logout redirect |
| `R-NeuroIQ-Admin-Portal/frontend/src/pages/Login.jsx` | Optional "Sign in via NeuroIQ Home" link |
| `R-NeuroIQ-Auth-Service/app/routers/auth.py` | db-login, refresh, logout, app-launcher |
| `R-NeuroIQ-Auth-Service/app/services/token_service.py` | RS256 access/refresh token creation |
| `R-NeuroIQ-Auth-Service/neuroiq_auth_lib/validator.py` | JWKS validate `neuroiq_at` |
| `R-NeuroIQ-Home/src/api/auth.ts` | Home login API |
| `R-NeuroIQ-Home/src/api/axios.ts` | Home 401 → refresh |

---

## Step-by-Step Execution Flow

### Path A — Unified login (recommended when flag ON)

#### Step 1: User signs in on Home

- **UI:** `R-NeuroIQ-Home/src/components/DbLoginForm.tsx`
- **API:** `POST /auth/db-login` (proxied to Auth Service port **8001**)
- **Auth Service:** validates password, checks Admin role (web db-login), creates `UserSession`, sets `neuroiq_at` + `neuroiq_rt` cookies (`path=/`, domain from `COOKIE_DOMAIN` e.g. `localhost`).

#### Step 2: User opens Admin from launcher

- **API:** `GET /auth/app-launcher/apps` (already authenticated)
- Browser navigates to Admin URL (same tab if `open_in_new_tab=0` in `app_launcher_apps`).

#### Step 3: Admin SPA loads session

- **File:** `frontend/src/contexts/AuthContext.jsx` → `GET /api/auth/me` with `withCredentials: true`
- **Backend:** `get_current_user` reads `neuroiq_at` → `validate_neuroiq_token` (JWKS) → `UserService.get(db, user_id)` from **Admin DB**
- **Response:** user profile; React sets `user`, `isAuthenticated=true`.

#### Step 4: Access token expires (401 on API call)

- **Frontend:** `axios.js` interceptor → `POST /auth/refresh` (Auth Service) first
- On success: retry original request
- On failure: `POST /api/auth/refresh` (legacy Admin cookie path)
- On total failure: redirect to login (Home URL when unified logout/login config applies)

#### Step 5: User signs out

- **Frontend:** `authService.logout()` → Auth Service `/auth/logout` + Admin `/api/auth/logout`
- **Redirect:** `window.location.href = getHomeLoginUrl()` **before** `setUser(null)` to avoid Admin login flash
- User lands on Home `/login`.

---

### Path B — Legacy Admin-only login (flag ON or OFF)

#### Step 1: User uses Admin login page

- `POST /api/auth/login` → `AuthService.login` → HS256 tokens
- Cookies: `access_token`, `refresh_token` on Admin origin (port 8000 API / 5173 UI via proxy)

#### Step 2: `/api/auth/me`

- `get_current_user` uses legacy path if no valid `neuroiq_at`

#### Step 3: Refresh / logout

- `POST /api/auth/refresh`, `POST /api/auth/logout` only (Admin cookies)

MSAL `azure-login` follows the same legacy cookie pattern.

---

## Configuration

### Repo root `.env` (Admin Portal — source of truth for Vite `envDir`)

```env
USE_AUTH_SERVICE=true
VITE_USE_AUTH_SERVICE=true

AUTH_SERVICE_URL=http://localhost:8001
AUTH_SERVICE_ISSUER=http://localhost:8001
HOME_APP_URL=http://localhost:3000

VITE_AUTH_SERVICE_URL=http://localhost:8001
VITE_HOME_APP_URL=http://localhost:3000
```

**Rule:** If both `USE_AUTH_SERVICE` and `VITE_USE_AUTH_SERVICE` are set, they must **agree**. Mismatch (e.g. backend true, frontend false) forces unified auth **off** in backend AND prevents inconsistent UI.

### Auth Service (local)

- Port **8001** (Admin backend defaults to **8000** — do not run two services on same port)
- `COOKIE_DOMAIN=localhost`
- CORS must include Home `3000` and Admin UI `5173`
- Shared MySQL e.g. `dev_niq_admin`

### Ports (local dev)

| Service | Port |
|---------|------|
| Auth Service | 8001 |
| Home | 3000 |
| Admin API | 8000 |
| Admin UI (Vite) | 5173 |

---

## Security and validation notes

1. **JWT `sub` must be string** — Auth Service `token_service.py` uses `str(user_id)`; integer `sub` caused `Subject must be a string` and 401 on Admin `/me`.
2. **JWKS cache** — Admin configures issuer URL at startup; validator fetches `/.well-known/jwks.json`.
3. **HttpOnly cookies** — JS cannot read tokens; `withCredentials: true` on axios.
4. **Parallel auth** — Legacy and unified can coexist; first valid cookie wins per request (neuroiq preferred when enabled).
5. **RBAC** — Permission checks still use Admin DB roles after user resolution; Auth Service role gate on db-login is separate (web login requires Admin role).

---

## Known issues and fixes (from integration work)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login 200 but `/me` 401 loop | JWT `sub` not string | `token_service.py` stringify `sub` / `org_id` |
| `USE_AUTH_SERVICE=false` ignored | Backend true, frontend false | AND logic in `use_auth_service()`; align both env vars |
| Logout flashes Admin login | State cleared before redirect | Redirect to Home in `logout()` before `setUser(null)` |
| Home refresh 401 after db-login | Same `sub` bug or cookie domain | Fix tokens; set `COOKIE_DOMAIN=localhost` |
| Admin cannot install auth lib | Python version | Use Admin venv 3.11+; `neuroiq-auth-lib` editable from Auth Service repo |

---

## Test matrix

| # | USE_AUTH_SERVICE | Login path | Expected |
|---|------------------|------------|----------|
| 1 | false | Admin `/api/auth/login` | Legacy cookies only; `/me` works |
| 2 | true | Home db-login → open Admin | `neuroiq_at`; `/me` 200 without Admin login form |
| 3 | true | Admin legacy login | `access_token`; `/me` 200 |
| 4 | true | Logout from Admin | Cookies cleared; redirect Home `/login` |
| 5 | true | Expired access | `/auth/refresh` then retry; fallback `/api/auth/refresh` |
| 6 | true | Mismatched env flags | Unified path disabled (safe default) |

---

## Operational checklist

- [ ] Auth Service running on 8001
- [ ] `USE_AUTH_SERVICE` and `VITE_USE_AUTH_SERVICE` match
- [ ] `app_launcher_apps.app_url` for `admin_portal` points to correct Admin URL
- [ ] `open_in_new_tab = 0` if same-tab launcher behavior desired
- [ ] No duplicate conflicting vars in `frontend/.env` overriding root `.env`
- [ ] `pip install` / editable `neuroiq_auth_lib` in Admin backend venv

---

## Related documentation

- `R-NeuroIQ-Admin-Portal/.env.example`
- `R-NeuroIQ-Product-Planning/.../LOCAL_DEV_SETUP.md` (Admin auth env + port 8001 note)
- Branch: `feat/unified-auth-service-integration` in Admin Portal repo

---

## Feature complexity

**Medium** — limited file surface, but cross-repo cookies, env symmetry, proxy wiring, and dual refresh/logout require careful local setup.
