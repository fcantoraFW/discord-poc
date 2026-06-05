# Producción — Vercel + Gateway worker

La app Next.js vive en **Vercel**. El bot de Discord necesita un **proceso aparte** que mantenga el Gateway WebSocket (no alcanza con Vercel Hobby ni con Interactions URL solo).

Arquitectura:

```text
Discord → Gateway worker (Railway/Render/Mac) → POST eventos → Vercel /api/webhooks/discord
                                                              → Cursor Cloud + Supabase
```

---

## Parte 1 — Vercel (app web + API)

### Variables de entorno (Production)

Copiá desde `.env.local` y revisá con:

```bash
export $(grep -v '^#' .env.local | xargs) 2>/dev/null; pnpm check:env:vercel
```

| Variable                               | Obligatorio | Notas                                                |
| -------------------------------------- | ----------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Sí          | `https://discord-poc-ten.vercel.app` (sin `/` final) |
| `NEXT_PUBLIC_SUPABASE_URL`             | Sí          | Con `https://`                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí          |                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`            | Sí          |                                                      |
| `CURSOR_API_KEY`                       | Sí          |                                                      |
| `CURSOR_CLOUD_REPO`                    | Sí          | `fcantoraFW/discord-poc`                             |
| `CURSOR_CLOUD_REF`                     | Sí          | `main` — no usar SHA                                 |
| `DISCORD_*`                            | Sí          | Ver `.env.example`                                   |
| `REDIS_URL`                            | Sí (prod)   | Upstash `rediss://...`                               |

**No** configurar `CURSOR_CLOUD_REF_MODE=sha`.

### Supabase (producción)

1. **Authentication → Sign In / Providers → Email → Confirm email: ON**
2. **Authentication → URL Configuration:**
   - Site URL: `https://TU-DOMINIO.vercel.app`
   - Redirect URLs: `https://TU-DOMINIO.vercel.app/**` (y `http://localhost:3000/**` si compartís proyecto con local)
3. **Primer superadmin:** Dashboard → Users → Add user → SQL `update public.profiles set role = 'superadmin' where email = '...'`
4. **Members/admins:** invitar desde `/superadmin` o `/manage/members` → invitado activa en `/auth/accept-invite`
5. **Forgot password:** disponible en `/auth/login`; reset vía `/auth/update-password`

### Discord Developer Portal

| Campo                        | Valor                                                     |
| ---------------------------- | --------------------------------------------------------- |
| Interactions Endpoint URL    | `https://TU-DOMINIO.vercel.app/api/webhooks/discord`      |
| OAuth2 Redirect              | `https://TU-DOMINIO.vercel.app/api/auth/discord/callback` |
| Bot → Message Content Intent | Activado                                                  |

### Deploy

1. Push a `main` en GitHub.
2. Vercel enlazado al repo → deploy automático.
3. Probar `/chat` y **Connect Discord** en `/settings` (redirect no debe ir a localhost).

---

## Parte 2 — Gateway worker (obligatorio para @mention)

### Opción recomendada: Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → repo `discord-poc`.
2. Si ya tenés el servicio de Vercel en el mismo repo, creá un **segundo servicio** en el mismo proyecto Railway (o proyecto nuevo solo para el worker).
3. **Settings → Deploy:**
   - Start command: `pnpm run start:gateway`
   - O usar `railway.toml` del repo (ya incluido).
4. **Variables** (ver `.env.gateway.example`):

   ```env
   NEXT_PUBLIC_APP_URL=https://TU-DOMINIO.vercel.app
   DISCORD_BOT_TOKEN=...
   DISCORD_PUBLIC_KEY=...
   DISCORD_APPLICATION_ID=...
   DISCORD_CLIENT_ID=...
   REDIS_URL=...          # mismo valor que en Vercel
   GATEWAY_LISTENER_MS=86400000
   ```

5. Deploy → en **Logs** debe aparecer:
   ` [discord-gateway] listening ... → https://TU-DOMINIO.vercel.app/api/webhooks/discord`

6. Probar @mention en Discord (guild vinculado en `/admin/discord`).

**Costo:** Railway tiene trial/créditos; el worker es liviano (solo WebSocket + forward).

### Opción B: Render

1. Dashboard → **New** → **Blueprint** → conectar repo (usa `render.yaml`).
2. Completar env vars igual que Railway.
3. Plan free puede dormir el worker — para PoC estable preferir Railway o Mac.

### Opción C: Mac local (ya probado)

```bash
pnpm discord:gateway
```

`NEXT_PUBLIC_APP_URL` debe apuntar a Vercel aunque el worker corra en tu máquina.

### No recomendado en Hobby

- **Vercel Cron** (`vercel.json`): requiere plan Pro; en Hobby cada ping dura ~10 s.
- **Solo cron-job.org** sin worker: huecos largos sin conexión.

---

## Parte 3 — Checklist funcional

- [ ] Vercel deploy OK; `/chat` responde con Cursor
- [ ] `NEXT_PUBLIC_APP_URL` en Vercel = URL real
- [ ] Connect Discord en prod sin localhost
- [ ] `/admin/discord`: guild vinculado + bot invitado al servidor
- [ ] Gateway worker corriendo (Railway logs activos)
- [ ] `REDIS_URL` en **Vercel y worker** (mismo Upstash)
- [ ] @mention al **nombre del bot** en el canal

---

## Verificación rápida

```bash
# Con .env.local cargado
pnpm check:env:vercel
pnpm check:env:gateway
```

Probar webhook (debe responder al PING de Discord):

```bash
curl -sI "https://TU-DOMINIO.vercel.app/api/webhooks/discord"
```

---

## Troubleshooting prod

| Síntoma                 | Causa probable                                       |
| ----------------------- | ---------------------------------------------------- |
| Bot silencioso          | Worker caído o no desplegado                         |
| OAuth localhost         | Falta `NEXT_PUBLIC_APP_URL` en Vercel                |
| Chat OK, Discord no     | Falta gateway o `REDIS_URL` distinto entre servicios |
| Error al conectar guild | Falta vínculo en `/admin/discord`                    |
