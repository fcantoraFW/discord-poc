# Flywheel — Discord + Cursor PoC

PoC interno: chat web con agentes **Cursor Cloud** por organización, y bot de **Discord** (Vercel Chat SDK) que responde solo a members registrados.

**Repo de referencia:** `fcantoraFW/discord-poc` en GitHub. **App en prod (ejemplo):** `https://discord-poc-ten.vercel.app`.

## Stack

- Next.js App Router + TypeScript
- Supabase (Auth, Postgres, RLS)
- **Cursor Cloud Agents REST API** (`lib/cursor/cloud-client.ts`) — sin `@cursor/sdk` en runtime (evita `sqlite3` en Vercel)
- `chat` + `@chat-adapter/discord` + Redis (prod) / memoria (local)

---

## Resumen: qué cambió respecto al plan inicial

Durante el setup real aparecieron ajustes que **no** estaban en el primer paso a paso. Este README refleja el flujo probado.

| Tema | Problema | Solución aplicada |
|------|----------|-------------------|
| **Cursor en Vercel** | `Failed to load external module @cursor/sdk` / `sqlite3` bindings | Sacar `@cursor/sdk`; llamar a `api.cursor.com` vía `lib/cursor/cloud-client.ts` |
| **Cursor Cloud branch** | `Branch 'ae5f21a…' does not exist` o fallo con `main` | `startingRef` = **nombre de rama** (`main`), nunca SHA. Repo resuelto con `GET /v1/repositories` (cuenta conectada en Cursor Integrations) |
| **Supabase signUp** | `Failed to fetch` | `NEXT_PUBLIC_SUPABASE_URL` debe incluir `https://` |
| **Connect Discord en prod** | OAuth con `redirect_uri=localhost` | `NEXT_PUBLIC_APP_URL` en Vercel + `getAppUrl()` con host de Vercel / request |
| **Bot no responde @mention** | Interactions URL solo no recibe mensajes | **Gateway WebSocket** obligatorio; en Hobby Vercel no hay cron útil → `pnpm discord:gateway` local u opciones abajo |
| **Secrets** | `.env.local` commiteado | No subir; rotar keys si hubo push |
| **pnpm + Discord** | `zlib-sync` warnings en dev | `node scripts/ensure-native-deps.mjs` (opcional, solo zlib) |

**No uses** `CURSOR_CLOUD_REF_MODE=sha` — Cursor valida `startingRef` como **nombre de rama**, no como commit.

---

## Paso a paso (orden recomendado)

### 1. Clonar e instalar

```bash
cd /ruta/a/discord-poc
cp .env.example .env.local
pnpm install
node scripts/ensure-native-deps.mjs   # opcional: zlib-sync para Discord en local
```

Completá `.env.local` con todas las variables de `.env.example`.

### 2. Supabase

1. Proyecto en [database.new](https://database.new).
2. SQL Editor → ejecutar `supabase/migrations/20250602000000_initial.sql`.
3. **Authentication → URL Configuration:**
   - `http://localhost:3000/**`
   - `https://TU-DOMINIO.vercel.app/**` (producción)
4. Registrate en la app (`/auth/sign-up` o login).
5. Super-admin:

```sql
update public.profiles
set role = 'superadmin'
where email = 'tu@email.com';
```

### 3. Cursor Cloud (chat web)

1. API key en [Cursor Integrations](https://cursor.com/dashboard/integrations).
2. Repo en GitHub; en env:
   ```env
   CURSOR_API_KEY=...
   CURSOR_CLOUD_REPO=fcantoraFW/discord-poc
   CURSOR_CLOUD_REF=main
   ```
3. En Integrations: **GitHub conectado** y repo **autorizado** en la lista de Cursor (público no alcanza si no está vinculado a tu API key).
4. Probar **Fase 1** antes de Discord:
   - `/admin` → crear **organización** → **asistente** (instructions + context).
   - `/chat` → **Nueva conversación** → mensaje de prueba.
   - Si falla por branch/repo: nueva conversación (limpia `cursor_agent_id` viejo) y revisar env arriba.

### 4. Discord — aplicación y env

[Discord Developer Portal](https://discord.com/developers/applications):

| Paso | Dónde | Qué |
|------|--------|-----|
| Bot | Bot | Token → `DISCORD_BOT_TOKEN`; activar **Message Content Intent** (y Members si hace falta) |
| OAuth2 | Redirects | `http://localhost:3000/api/auth/discord/callback` **y** `https://TU-DOMINIO/api/auth/discord/callback` |
| General | Public Key | `DISCORD_PUBLIC_KEY` |
| General | Interactions Endpoint URL | `https://TU-DOMINIO/api/webhooks/discord` (debe validar PING) |
| OAuth2 | Client ID / Secret | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_APPLICATION_ID` |

En `.env.local` / Vercel:

```env
NEXT_PUBLIC_APP_URL=https://TU-DOMINIO.vercel.app   # sin barra final; crítico en prod
DISCORD_BOT_USERNAME=flywheel                      # opcional
CRON_SECRET=un-string-largo-aleatorio              # protege /api/discord/gateway
REDIS_URL=rediss://...                             # Upstash; prod recomendado
```

### 5. Vincular servidor Discord (super-admin)

1. **Settings** → **Connect Discord** (OAuth `identify`) — tu cuenta queda en `profiles.discord_user_id`.
2. **Admin → Discord guilds** (`/admin/discord`):
   - **Refrescar lista de servidores (OAuth)** — scope `guilds`.
   - Elegir guild → **organización** + **asistente default** → **Guardar vínculo**.
   - **Generar invite del bot** → abrir URL e invitar el bot al servidor.
3. En Discord: **@mention al bot por nombre** (ej. `@flywheel`), no solo un rol genérico.

Members (no super-admin) también necesitan **Connect Discord** en `/settings` y pertenecer a la org del guild (o ser super-admin con Discord conectado).

### 6. Gateway — sin esto el bot no ve @mentions

El Chat SDK en Vercel **no** recibe mensajes de canal solo con Interactions URL. Hace falta **Gateway** que reenvía a `/api/webhooks/discord`.

#### Desarrollo / PoC (lo que probamos que funciona)

App en Vercel (o `pnpm dev` local) **+** en otra terminal:

```bash
# .env.local: NEXT_PUBLIC_APP_URL = URL donde corre la app (prod o localhost)
# Mismas DISCORD_* y REDIS_URL que usa la app
pnpm discord:gateway
```

Dejar la terminal abierta mientras usás Discord.

#### Producción

**Guía:** [docs/PRODUCTION.md](docs/PRODUCTION.md)

1. **Vercel** — app + variables (`pnpm check:env:vercel`).
2. **Railway** (recomendado) — mismo repo, start command `pnpm run start:gateway`, env de `.env.gateway.example` (`pnpm check:env:gateway`).
3. Logs del worker: `listening ... → https://TU-DOMINIO/api/webhooks/discord`.

Archivos: `railway.toml`, `render.yaml`, `.env.gateway.example`.

Alternativa temporal: **Mac** con `pnpm discord:gateway` y `NEXT_PUBLIC_APP_URL` apuntando a Vercel.

### 7. Correr todo en local

```bash
pnpm dev                    # terminal 1 — web + API
pnpm discord:gateway        # terminal 2 — Discord @mentions (obligatorio para bot)
```

---

## Checklist producción

Ver [docs/PRODUCTION.md](docs/PRODUCTION.md). Corto:

- [ ] Vercel: env completo + `pnpm check:env:vercel`
- [ ] Railway (o worker): `pnpm run start:gateway` + `pnpm check:env:gateway`
- [ ] Mismo `REDIS_URL` en Vercel y worker
- [ ] Discord Portal: Interactions + OAuth con host de prod
- [ ] Guild vinculado en `/admin/discord` + bot en el servidor

---

## Flujos por rol

| Rol | Rutas |
|-----|--------|
| Super-admin | `/admin`, `/admin/orgs/:id`, `/admin/discord` |
| Member | `/chat`, `/settings` |

**Discord (orden):**

1. Super-admin: org + asistente → Connect Discord (Settings) → Admin Discord: vincular guild + invite bot.
2. Member: Connect Discord en Settings.
3. Servidor: @mention al bot o DM (una sola org).

---

## Troubleshooting

| Síntoma | Qué revisar |
|---------|-------------|
| Chat: `Failed to determine repository default branch` / branch no existe | `CURSOR_CLOUD_REF=main`; repo en Cursor Integrations; **Nueva conversación** en `/chat` |
| Chat: `Branch '<sha>' does not exist` | Quitar `CURSOR_CLOUD_REF_MODE=sha`; solo rama `main` |
| Vercel: error `sqlite3` / `@cursor/sdk` | Debe estar el cliente HTTP; no reinstalar `@cursor/sdk` en la app |
| Connect Discord → localhost en prod | `NEXT_PUBLIC_APP_URL` en Vercel; redeploy |
| Bot invitado pero silencio | ¿Corre `pnpm discord:gateway`? ¿Message Content Intent? ¿Guild vinculado en admin? |
| Bot responde error “no registrado” | Connect Discord en Settings; profile en la org del guild |
| Bot: “servidor no vinculado” | `/admin/discord` → guardar vínculo guild → org |

---

## Estructura del código

```
app/(app)/chat              — UI member
app/(admin)/admin           — CRUD orgs / assistants
app/(admin)/admin/discord   — vínculo guild ↔ org
app/api/chat                — SSE + Cursor Cloud HTTP
app/api/webhooks/discord    — eventos Discord (incl. Gateway reenviado)
app/api/discord/gateway     — listener corto (Hobby) o cron Pro
app/api/auth/discord/*      — OAuth connect / guilds / callback
lib/cursor/cloud-client.ts  — REST api.cursor.com
lib/cursor/agent.ts         — orquestación chat + repos Cursor
lib/cursor/gateway-worker.ts
lib/discord/bot.ts
lib/chat/pipeline.ts
scripts/discord-gateway-worker.ts
scripts/check-production-env.mjs
railway.toml
.env.gateway.example
docs/PRODUCTION.md
.github/workflows/discord-gateway.yml
```

---

## Criterios de listo

- **Fase 1:** super-admin crea org + asistentes → usuario chatea en `/chat` con historial y respuestas Cursor Cloud.
- **Fase 2:** con gateway activo, bot responde en guild vinculado a members (o super-admin) con Discord conectado.

---

## Seguridad

- **Nunca** commitear `.env.local`.
- Si se subieron secrets a GitHub: rotar Supabase, Cursor, Discord, Redis/Upstash y limpiar historial git.
