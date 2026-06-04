REDIS_URL="rediss://default_ro:[ggAAAAAAAaTOAAIgcDGpfuQgDvGFU6uzpuC2Q9se4NmQpb009zQakfO4nUQ2Iw@sunny-mole-107726.upstash.io](mailto:ggAAAAAAAaTOAAIgcDGpfuQgDvGFU6uzpuC2Q9se4NmQpb009zQakfO4nUQ2Iw@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default_ro:[ggAAAAAAAaTOAAIgcDGpfuQgDvGFU6uzpuC2Q9se4NmQpb009zQakfO4nUQ2Iw@sunny-mole-107726.upstash.io](mailto:ggAAAAAAAaTOAAIgcDGpfuQgDvGFU6uzpuC2Q9se4NmQpb009zQakfO4nUQ2Iw@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"REDIS_URL="rediss://default:[gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io](mailto:gQAAAAAAAaTOAAIgcDE4OTEwNTU3NTEyMmI0ZmE0YmRhMTQ4ZThiM2NlOGJkOQ@sunny-mole-107726.upstash.io):6379"asdfsdfsdfsfsdfdsdfsdfsfdsfsdfdfdfdfdfdfdfdfddfdfddfdfdffdfdfdfdfdfdsdssdsdsdsds# Flywheel — Discord + Cursor PoC

PoC interno: chat web con agentes **Cursor Cloud** por organización, y bot de **Discord** (Vercel Chat SDK) que responde solo a members registrados.

## Stack

- Next.js App Router + TypeScript
- Supabase (Auth, Postgres, RLS)
- `@cursor/sdk` (Cloud agents, repo compartido)
- `chat` + `@chat-adapter/discord` + Redis/memory state

## Setup rápido

### 1. Variables de entorno

```bash
cp .env.example .env.local
```

Completá todas las variables (ver checklist abajo).

### 2. Supabase

1. Creá un proyecto en [database.new](https://database.new).
2. En el SQL Editor, ejecutá la migración:
  - `[supabase/migrations/20250602000000_initial.sql](supabase/migrations/20250602000000_initial.sql)`
3. En **Authentication → URL Configuration**, agregá:
  - `http://localhost:3000/`**
  - Tu URL de Vercel preview/prod
4. Registrate en la app (`/auth/sign-up` o login).
5. Promové tu usuario a super-admin:

```sql
update public.profiles
set role = 'superadmin'
where email = 'tu@email.com';
```

### 3. Cursor

1. Creá una API key en [Cursor Integrations](https://cursor.com/dashboard/integrations).
2. Subí este repo a GitHub y configurá `CURSOR_CLOUD_REPO=owner/repo` y `CURSOR_CLOUD_REF=main`.
3. En [Cursor Integrations](https://cursor.com/dashboard/integrations): conectá **GitHub** y autorizá el repo `fcantoraFW/discord-poc` (si no aparece en la lista de Cursor, Cloud Agent falla aunque el repo sea público).
4. `CURSOR_CLOUD_REF=main` (rama default del repo).

### 4. Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application.
2. **Bot** → copiá token → `DISCORD_BOT_TOKEN`; habilitá **Message Content Intent**.
3. **OAuth2** → Redirects:
  - `http://localhost:3000/api/auth/discord/callback`
  - (y la URL de producción)
4. Copiá **Client ID** → `DISCORD_CLIENT_ID` y `DISCORD_APPLICATION_ID`.
5. Copiá **Client Secret** → `DISCORD_CLIENT_SECRET`.
6. **General** → Public Key → `DISCORD_PUBLIC_KEY`.
7. Interactions/webhook URL (producción): `https://tu-dominio/api/webhooks/discord`.

### 5. Redis (Discord en producción)

Creá una base en [Upstash](https://upstash.com) y poné la URL en `REDIS_URL` o `UPSTASH_REDIS_URL`. En local, sin Redis, el bot usa memoria (solo una instancia).

### 6. Correr local

```bash
pnpm install
# Compila sqlite3 (requerido por @cursor/sdk). Si el chat falla con "bindings file":
node scripts/ensure-native-deps.mjs
pnpm dev
```

**Importante:** no subas `.env.local` a GitHub (contiene secrets). Si ya lo commiteaste, borralo del historial y rotá todas las keys.

## Flujos


| Rol         | Rutas                                         |
| ----------- | --------------------------------------------- |
| Super-admin | `/admin`, `/admin/orgs/:id`, `/admin/discord` |
| Member      | `/chat`, `/settings` (Connect Discord)        |


**Discord**

1. Admin: OAuth guilds → elegir servidor → org + asistente → invite del bot.
2. Member: Connect Discord en `/settings`.
3. En el servidor: @mention al bot o DM (si pertenecés a una sola org).

## Checklist infra (Vercel)

- Repo en GitHub + `CURSOR_CLOUD_REPO`
- `CURSOR_API_KEY`
- Supabase URL + publishable + service role
- Discord bot + OAuth + public key
- `REDIS_URL` (Upstash)
- `NEXT_PUBLIC_APP_URL` = URL de producción
- Webhook Discord → `/api/webhooks/discord`

## Estructura

```
app/(app)/chat          — UI member
app/(admin)/admin       — CRUD orgs / assistants / Discord
app/api/chat            — streaming SSE + historial
app/api/webhooks/discord
lib/cursor/agent.ts     — Cursor Cloud
lib/chat/pipeline.ts    — mensajes web + Discord
lib/discord/bot.ts      — Chat SDK handlers
supabase/migrations/
```

## Criterios de listo

- **Fase 1:** super-admin crea org + assistants → member invitado chatea en `/chat` con historial.
- **Fase 2:** bot responde en guild vinculado solo a members con Discord conectado.

