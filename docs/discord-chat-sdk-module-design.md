# Discord × Chat SDK — Módulo Deep (Strategy Pattern)

> **Estado:** diseño cerrado (charla grill-me, jun 2025). Pseudocódigo acordado; sin implementación productiva aún.

## Resumen ejecutivo

Módulo npm **deep** que conecta Discord con [Vercel Chat SDK](https://chat-sdk.dev/docs): adapter, webhooks, OAuth, auth gate y gateway worker. La lógica de producto (orgs, assistants, AI) vive en el **host** vía **strategies** (persistencia, policies) y **callbacks** (mensajes autorizados/rechazados).

```pseudo
createDiscordChatModule({ stores, authPolicy, callbacks })
  → handlers.webhook | handlers.auth.*
  → chat (escape hatch)
runDiscordGatewayWorker({ module, webhookBaseUrl })   // subpath /gateway
```

| Decisión | Resultado |
|----------|-----------|
| D1 Frontera | Solo conexión + auth transport |
| D2 Auth flows | User Connect + GuildLinkStore + invite helper |
| D3 Strategies/callbacks | 5 strategies + 3 callbacks |
| D4 Gateway | Código en módulo; deploy en host |
| D5 Multi-tenant | `DiscordAuthPolicy` + defaults + hooks |
| D6 API | Handlers HTTP sueltos + `module.chat` opt-in |
| D7 | Pseudocódigo completo (§ abajo) |

## Índice

1. [Contexto](#contexto)
2. [Glosario Chat SDK](#glosario-chat-sdk-referencia-chat-sdkdevdocs)
3. [Decisiones D1–D6](#decisiones-acordadas)
4. [Pseudocódigo final D7](#d7--pseudocódigo-final-)
5. [Mapeo PoC → módulo](#mapeo-discord-poc--módulo)
6. [Próximos pasos](#próximos-pasos)

## Contexto

- **Objetivo:** un módulo reutilizable que conecte Discord con [Vercel Chat SDK](https://chat-sdk.dev) (`chat` + `@chat-adapter/discord`), con flujo de auth para vincular usuarios y servidores al chatbot.
- **Patrón:** Strategy — el módulo expone contratos e infraestructura; la lógica de negocio vive fuera, inyectada por callbacks.
- **Referencia existente:** PoC `discord-poc` — OAuth (`lib/discord/oauth.ts`), bot handlers acoplados a Supabase/org (`lib/discord/bot.ts`), gateway worker obligatorio para @mentions.
- **No objetivo de esta charla:** implementar código productivo; llegar a pseudocódigo acordado.

## Pilares del diseño (Strategy aplicado)

| Rol Strategy | Responsabilidad tentativa |
|--------------|---------------------------|
| **Strategy (contrato)** | Interfaces para auth, resolución de identidad, persistencia de vínculos |
| **Concrete strategies** | Implementaciones concretas del host (Supabase, Postgres, in-memory) |
| **Context** | `DiscordChatModule` — wiring de adapter, webhooks, OAuth routes, gateway |

## Glosario Chat SDK (referencia: [chat-sdk.dev/docs](https://chat-sdk.dev/docs))

Definiciones que el módulo asume del SDK upstream — **no las reimplementa**.

| Concepto | Definición | Implicación para Discord |
|----------|------------|--------------------------|
| **Chat** | Entry point: coordina adapters, enruta eventos, gestiona state/locks/dedupe | El módulo crea y expone una instancia configurada; el host registra handlers de negocio vía callbacks |
| **Adapter** | Integración por plataforma: verificación webhook, parsing, formato, API nativa | `@chat-adapter/discord` → `createDiscordAdapter()`; credenciales vía env (`DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, etc.) |
| **State adapter** | Persistencia de subscriptions, locks, dedupe (Redis/PG/memory) | Obligatorio en prod multi-instancia; el módulo lo recibe por config, no impone backend |
| **Thread** | Contexto conversacional: `post()`, `subscribe()`, `stream()`, `setState()` | Punto de extensión del host en callbacks autorizados |
| **Webhook routing** | `bot.webhooks.discord` → handler HTTP por adapter | El módulo expone el handler listo para montar en `/api/webhooks/discord` |
| **Event routing** | DM → subscribed → mention → regex; reactions/slash/actions aparte | El módulo implementa un **pipeline de auth previo** antes de delegar al callback del host |
| **Gateway (Discord)** | WebSocket para mensajes de canal (@mentions); Interactions URL sola no alcanza | Código en módulo (D4); deploy en proceso aparte del host |

### Capacidades Discord en Chat SDK

Según la matriz oficial: mentions ✓, reactions ✓, cards ✓, modals ✗, streaming post+edit ✓, DMs ✓.

Handlers relevantes para nuestro módulo:

- `onNewMention` — entrada típica en guild (requiere subscribe + auth previo)
- `onDirectMessage` — DMs (requiere resolver tenant cuando hay multi-org)
- `onSubscribedMessage` — conversación multi-turno post-auth
- `onSlashCommand` — comandos como `/asistente` (auth igual que mensajes)

---

## Decisiones acordadas

### D1 — Frontera del módulo deep ✅

**Acordado:** el módulo es **solo capa de conexión Discord ↔ Chat SDK + transporte de auth**. No contiene dominio de producto (orgs, assistants, Cursor, Supabase).

| Dentro | Fuera (host) |
|--------|--------------|
| Crear/configurar `Chat` + `createDiscordAdapter` | Modelo de tenant, member, assistant |
| Webhook handler (`bot.webhooks.discord`) | Persistencia concreta de links |
| OAuth HTTP (authorize, callback, token exchange) | Reglas de autorización de negocio |
| Gateway worker (`runDiscordGatewayWorker`) | Qué hacer con mensaje autorizado |
| Contratos mínimos (`DiscordUserId`, `GuildId`, tipos opacos) | UI admin, mensajes de error de producto |
| Pipeline: evento Chat SDK → auth gate → callback | CRUD de orgs/guilds |

**Principio:** el módulo conoce Discord y Chat SDK; el host conoce su dominio. Comunicación vía **callbacks obligatorios** + **strategies intercambiables** donde hay variantes reales.

### D2 — Flujos de auth/link ✅

**Acordado: opción 2** — A + B como primitives del módulo; C como helper puro.

| Flujo | Rol del módulo | Mecanismo |
|-------|----------------|-----------|
| **A — User Connect** | Primitive de primera clase | OAuth `identify` (scopes configurables), routes/handlers, exchange token, callback al host |
| **B — Guild Link** | Primitive vía **Strategy** | Contrato `GuildLinkStore`; el host define el payload opaco (`HostLink`) y la persistencia |
| **C — Bot Invite** | Helper, no flujo | `buildBotInviteUrl({ guildId, permissions?, scopes? })` — sin UI ni dominio |

El módulo **no** incluye wizard admin ni conoce campos del link (org, assistant, etc.).

```pseudo
// Contrato B — persistencia intercambiable
interface GuildLinkStore {
  get(guildId: GuildId): Promise<HostLink | null>
  save(guildId: GuildId, data: HostLink): Promise<void>
  delete?(guildId: GuildId): Promise<void>
}

// HostLink es type parameter opaco del host — el módulo solo lo pasa de vuelta en callbacks
```

Flujo A esperado (alto nivel):

```pseudo
GET  /auth/discord/connect     → redirect OAuth (state en store)
GET  /auth/discord/callback    → exchange code → fetchDiscordUser → onUserLinked(...)
```

Flujo B esperado (alto nivel):

```pseudo
// Host UI llama OAuth guilds (módulo provee route opcional o helper)
GET  /auth/discord/guilds      → lista guilds del token OAuth
// Host elige guild + metadata → persiste vía GuildLinkStore.save()
// Host genera invite con buildBotInviteUrl(guildId)
```

### Anexo — ¿Por qué strategies y callbacks *en* el módulo?

Referencia: módulo **deep** (Ousterhout) = interfaz simple, complejidad escondida adentro. Strategies y callbacks son la **interfaz pública** del módulo; las **implementaciones concretas** viven en el host.

#### Strategies — contratos que el módulo **define**; implementaciones que el host **inyecta**

| Incluir el contrato en el módulo | NO incluirlo (dejar todo al host) |
|----------------------------------|-----------------------------------|
| El módulo sabe **cuándo** necesita persistir state OAuth, links de user/guild — eso es infra de conexión, no negocio | Si no hay contrato, cada host reimplementa el mismo wiring OAuth↔store ad hoc |
| Variantes reales y estables: Redis vs cookie, Supabase vs Prisma | Forzar Strategy para cosas con una sola forma (ej. `buildBotInviteUrl`) = ruido |
| OCP: agregar backend nuevo = nueva clase, sin tocar el módulo | Sin Strategy, el módulo acaba con `if (supabase) … else if (prisma) …` — antipatrón |
| Testeable: el módulo shippea `InMemoryOAuthStateStore` para tests | El host pierde un “slot” claro de plug-in y acopla rutas OAuth a su ORM directamente |

**Qué NO va como Strategy:** reglas de negocio (“superadmin bypass”, “elegir assistant por thread”). Eso no es “cómo persisto”, es “qué significa autorizado” → callback.

#### Callbacks — firmas que el módulo **define**; cuerpo que el host **implementa**

| Incluir callbacks en el módulo | NO incluirlos (eventos raw de Chat SDK al host) |
|-------------------------------|--------------------------------------------------|
| El módulo implementa el **auth gate** una sola vez: preload links → `authPolicy.resolve` → callbacks | Sin callbacks, cada host repite boilerplate sobre `onNewMention` / `onDirectMessage` |
| Frontera D1 se respeta: el módulo nunca importa Supabase/Cursor; solo invoca `authPolicy` + callbacks | Exponer solo `bot.onNewMention` “crudo” tiende a filtrar lógica de dominio **dentro** del módulo para “ayudar” |
| El host recibe contexto ya normalizado (`DiscordEvent`, `GuildId`, `Thread`) | Mezclar `message.raw.guild_id` con OAuth en cada app = leaky abstraction |
| Un solo lugar documentado para extender comportamiento | Múltiples puntos de extensión = API difusa, difícil de mantener como paquete |

**Qué NO va como callback del módulo:** persistencia CRUD genérica que ya cubre una Strategy (`UserLinkStore.save` vs duplicar en `onUserLinked`). `onUserLinked` = side effects de negocio post-OAuth; el store = dónde se guarda.

#### Regla práctica acordada

```
¿Cambia entre deployments por tecnología (Redis, Supabase, NextAuth)?  → Strategy (contrato en módulo)
¿Cambia por producto/reglas de negocio (org, roles, AI pipeline)?     → Callback (firma en módulo, lógica en host)
¿Es helper puro sin estado (invite URL, fetch guilds)?                → Función utilitaria del módulo
¿Es dominio del host opaco (HostLink fields)?                         → Type parameter del host, no del módulo
```

### D3 — Partición Strategy vs Callback ✅

**Acordado:** 5 strategies (stores + authPolicy) + 3 callbacks. `UserLinkStore` simétrico con `GuildLinkStore`; `onUserLinked` solo side effects.

#### Strategies (contratos — implementación en host)

| Strategy | Responsabilidad |
|----------|-----------------|
| `OAuthStateStore` | Persistir/validar `state` CSRF del OAuth (`set`, `get`, `delete`) |
| `AppSessionResolver` | Resolver app-user activo en routes OAuth (`getCurrentUser(): AppUser \| null`) |
| `UserLinkStore` | Vincular `appUserId` ↔ `discordUserId` (`link`, `findByDiscordId`, `findByAppUserId?`) |
| `GuildLinkStore` | Vincular `guildId` ↔ `HostLink` opaco (D2) |
| `DiscordAuthPolicy` | Auth gate multi-tenant — defaults + override (D5) |

El módulo invoca `UserLinkStore.link()` en el callback OAuth **antes** de `onUserLinked`.

#### Callbacks (firmas — lógica en host)

| Callback | Responsabilidad |
|----------|-----------------|
| `onUserLinked(ctx)` | Side effects post-OAuth: analytics, redirect — **no** persistir el link |
| `onAuthorizedMessage(ctx, thread, message)` | Mensaje/slash autorizado → pipeline del host (AI, tickets, etc.) |
| `onUnauthorized(ctx, thread, reason)` | Responder o silenciar; copy y UX del producto |

> Auth gate: no es callback suelto — ver **D5** `DiscordAuthPolicy` (+ `createDefaultAuthPolicy`).

#### Wiring interno del módulo (no expuesto salvo opt-in)

```pseudo
onNewMention / onDirectMessage / onSubscribedMessage / onSlashCommand
  → normalizeEvent()
  → preload links (GuildLinkStore, UserLinkStore)
  → authPolicy.resolve(input)                    // D5
  → authorized ? onAuthorizedMessage : onUnauthorized
```

#### Helpers (no strategy, no callback)

- `buildBotInviteUrl`, `fetchDiscordUser`, `fetchDiscordGuilds`, `exchangeDiscordCode`, `getAppUrl`

### D4 — Gateway worker ✅

**Acordado: opción 4c (híbrido)** — código del loop en el módulo; deploy/ops en el host.

| Dentro del módulo | Fuera (host) |
|-------------------|--------------|
| `runDiscordGatewayWorker(config)` usando `DiscordAdapter.startGatewayListener` | Railway / Render / terminal local / cron |
| Reconnect loop con backoff (patrón del PoC) | `NEXT_PUBLIC_APP_URL` / URL prod |
| Subpath export opcional (`/gateway`) | `railway.toml`, GitHub Actions, procesos PM2 |
| Docs: “Discord @mentions requieren worker aparte de Vercel” | Mismo `REDIS_URL` + env Discord en worker y app |

```pseudo
runDiscordGatewayWorker({
  module: DiscordChatModule   // o config mínima: bot instance / adapter
  webhookBaseUrl: string     // → `${base}/api/webhooks/discord`
  sessionDurationMs?: number // default ~15min; loop externo reinicia sesión
  onSessionEnd?: () => void
  onError?: (err: Error) => void
})

// Host deploy (ejemplo)
// railway start: node node_modules/@scope/discord-chat-sdk/gateway/cli.js
// local dev:     pnpm discord:gateway
```

**Principio:** el módulo provee el **cómo** conectar Gateway → webhook; el host decide **dónde** corre el proceso.

### D5 — Modelo de identidad multi-tenant ✅

**Acordado: opción 5c** — Policies como Strategy, con defaults empaquetados + override del host.

El módulo **precarga links** (guild + user) y delega la decisión a una **`DiscordAuthPolicy`** intercambiable. Shippea defaults para patrones comunes; el host override completo o compone hooks.

#### Pipeline de auth (runtime bot)

```pseudo
normalizeEvent(raw)
  → preload: guildLink = GuildLinkStore.get(guildId?)
  → preload: userLinks = UserLinkStore.findByDiscordId(discordUserId)
  → input = DiscordAuthInput { event, guildLink, userLinks }
  → ctx = await authPolicy.resolve(input)
  → ctx.authorized ? onAuthorizedMessage : onUnauthorized
```

#### Contrato Policy

```pseudo
interface DiscordAuthPolicy<HostLink, HostContext> {
  resolve(input: DiscordAuthInput<HostLink>): Promise<ResolvedContext<HostContext>>
}

type DiscordAuthInput = {
  event: NormalizedDiscordEvent   // guildId?, isDM, discordUserId, channelId, thread, ...
  guildLink: HostLink | null
  userLinks: LinkedAppUser[]      // 0..N
}

type ResolvedContext =
  | { authorized: true;  hostContext: HostContext }
  | { authorized: false; reason: UnauthorizedReason }

enum UnauthorizedReason {
  UNLINKED_GUILD
  USER_NOT_LINKED
  USER_NOT_IN_TENANT
  AMBIGUOUS_DM          // N userLinks en DM
  CUSTOM                // host define reason string en hostContext
}
```

#### Defaults empaquetados (módulo)

Composables — **estructura sin dominio Flywheel**:

```pseudo
// Factory recomendada para la mayoría de hosts
createDefaultAuthPolicy({
  membershipResolver: (discordUserId, guildLink) => Promise<LinkedAppUser | null>
  superadminBypass?: (discordUserId) => Promise<LinkedAppUser | null>
  dmPolicy?: 'single-tenant-only' | 'reject-ambiguous' | DmAuthPolicy
})

// Default guild: guildLink required → membershipResolver → superadminBypass?
// Default DM: 0 links → USER_NOT_LINKED; N>1 → AMBIGUOUS_DM; 1 → authorized
```

| Policy default | Regla estructural | Hook del host |
|----------------|-------------------|---------------|
| **Guild** | Sin `guildLink` → `UNLINKED_GUILD` | `membershipResolver` valida pertenencia al tenant del link |
| **Guild** | Sin user link → `USER_NOT_LINKED` | `superadminBypass?` opcional |
| **DM** | 0 links → `USER_NOT_LINKED` | — |
| **DM** | N>1 links → `AMBIGUOUS_DM` (configurable) | host mensaje en `onUnauthorized` |
| **DM** | 1 link → authorized | `hostContext` lo arma el host vía extensión post-policy* |

\* Opción: `mapAuthorizedUser(linkedUser): HostContext` callback en la factory default.

#### Override total

El host puede reemplazar `authPolicy` completo sin usar defaults — útil si el modelo de tenant no encaja (ej. Discord user → múltiples guilds activos con reglas custom).

```pseudo
createDiscordChatModule({
  authPolicy: myCustomPolicy,
  // ...
})
```

**Principio:** defaults = **topología** (guild/DM, cardinalidad, links); hooks = **pertenencia y roles** (org, superadmin, assistant).

### D6 — API pública ✅

**Acordado: opción 6a** — handlers HTTP sueltos (Web Standard) + escape hatch opt-in a `module.chat`.

#### Factory

```pseudo
createDiscordChatModule<HostLink, HostContext, AppUser>(config): DiscordChatModule
```

#### Handlers expuestos

```pseudo
module.handlers.webhook          // POST — bot.webhooks.discord
module.handlers.auth.connect     // GET  — inicia OAuth user (flujo A)
module.handlers.auth.callback    // GET  — callback OAuth A
module.handlers.auth.guilds      // GET  — lista guilds OAuth (flujo B, scope guilds)
```

El host monta paths libremente en App Router / Hono / etc.

#### Escape hatch

```pseudo
module.chat   // instancia Chat SDK — onReaction, slash extra, etc.
              // NO usar para bypass del auth gate en mensajes
```

#### Subpath exports

```
@scope/discord-chat-sdk           → factory, types, policies, helpers
@scope/discord-chat-sdk/gateway   → runDiscordGatewayWorker
@scope/discord-chat-sdk/testing   → in-memory stores, mock policies
```

Framework-agnostic en webhooks/OAuth — **sin** helper Next-specific (no mountAppRouter).

---

## D7 — Pseudocódigo final ✅

Conclusión acordada de la charla. Referencia implementable sin código productivo aún.

### 1. Tipos base (módulo)

```pseudo
type GuildId = string
type DiscordUserId = string

type LinkedAppUser = {
  appUserId: string
  discordUserId: DiscordUserId
  // host puede extender vía declaration merging o generic AppUser
}

type NormalizedDiscordEvent = {
  discordUserId: DiscordUserId
  guildId?: GuildId
  channelId: string
  isDM: boolean
  kind: 'mention' | 'dm' | 'subscribed' | 'slash'
  text: string
  thread: Thread          // Chat SDK
  raw: unknown
}
```

### 2. Strategies (contratos)

```pseudo
interface OAuthStateStore {
  set(state: string, payload: OAuthStatePayload): Promise<void>
  get(state: string): Promise<OAuthStatePayload | null>
  delete(state: string): Promise<void>
}

interface AppSessionResolver {
  getCurrentUser(): Promise<AppUser | null>
}

interface UserLinkStore {
  link(appUserId: string, discordUserId: DiscordUserId): Promise<void>
  findByDiscordId(id: DiscordUserId): Promise<LinkedAppUser[]>
  findByAppUserId?(id: string): Promise<LinkedAppUser | null>
}

interface GuildLinkStore<HostLink> {
  get(guildId: GuildId): Promise<HostLink | null>
  save(guildId: GuildId, data: HostLink): Promise<void>
  delete?(guildId: GuildId): Promise<void>
}

interface DiscordAuthPolicy<HostLink, HostContext> {
  resolve(input: DiscordAuthInput<HostLink>): Promise<ResolvedContext<HostContext>>
}
```

### 3. Config del host

```pseudo
type DiscordChatModuleConfig<HostLink, HostContext, AppUser> = {
  // --- Strategies (host implementa) ---
  oauthStateStore: OAuthStateStore
  appSessionResolver: AppSessionResolver
  userLinkStore: UserLinkStore
  guildLinkStore: GuildLinkStore<HostLink>
  authPolicy: DiscordAuthPolicy<HostLink, HostContext>
  // o: authPolicy: createDefaultAuthPolicy({ membershipResolver, superadminBypass?, mapAuthorizedUser? })

  // --- Chat SDK ---
  chat: {
    userName: string
    state: StateAdapter
    dedupeTtlMs?: number
    // ...
  }
  discord?: { /* overrides createDiscordAdapter */ }

  // --- OAuth ---
  oauth?: {
    userScopes?: string[]       // default ['identify']
    guildScopes?: string[]      // default ['identify', 'guilds']
    appUrl?: string | (req) => string
  }

  // --- Callbacks (host implementa) ---
  onUserLinked(ctx: UserLinkedContext): Promise<void | Response>
  onAuthorizedMessage(ctx: HostContext, thread: Thread, message: Message): Promise<void>
  onUnauthorized(ctx: Partial<HostContext>, thread: Thread, reason: UnauthorizedReason): Promise<void>
}
```

### 4. Factory + surface pública

```pseudo
function createDiscordChatModule<HostLink, HostContext, AppUser>(
  config: DiscordChatModuleConfig<HostLink, HostContext, AppUser>
): DiscordChatModule {

  chat = new Chat({
    userName: config.chat.userName,
    adapters: { discord: createDiscordAdapter(config.discord) },
    state: config.chat.state,
  })

  registerAuthGateHandlers(chat, config)   // wiring D5

  return {
    chat,   // escape hatch

    handlers: {
      webhook: (req) => chat.webhooks.discord(req),

      auth: {
        connect: (req) => handleOAuthConnect(req, config),
        callback: (req) => handleOAuthCallback(req, config),
        guilds: (req) => handleOAuthGuilds(req, config),
      },
    },
  }
}
```

### 5. Flujo A — User Connect (OAuth)

```pseudo
async function handleOAuthConnect(req, config) {
  appUser = await config.appSessionResolver.getCurrentUser()
  if !appUser → redirect login

  state = randomId()
  await config.oauthStateStore.set(state, { appUserId: appUser.id, flow: 'user' })

  url = discordAuthorizeUrl({
    redirectUri: `${appUrl(req)}/api/auth/discord/callback`,
    scope: config.oauth.userScopes ?? ['identify'],
    state,
  })
  return redirect(url)
}

async function handleOAuthCallback(req, config) {
  { code, state } = parseQuery(req)
  stored = await config.oauthStateStore.get(state)
  if !stored → 400

  tokens = await exchangeDiscordCode(code, redirectUri)
  discordUser = await fetchDiscordUser(tokens.access_token)

  await config.userLinkStore.link(stored.appUserId, discordUser.id)
  await config.oauthStateStore.delete(state)

  await config.onUserLinked({ appUserId: stored.appUserId, discordUser })

  return redirect('/settings?discord=connected')   // host decide en onUserLinked
}
```

### 6. Flujo B — Guild Link (host UI + store)

```pseudo
// Route guilds — admin lista servidores OAuth
async function handleOAuthGuilds(req, config) {
  // token guilds en session/cookie del host, o re-OAuth flow: 'guild'
  guilds = await fetchDiscordGuilds(accessToken)
  return json(guilds)
}

// Host admin UI (FUERA del módulo):
async function onAdminSaveGuildLink(form) {
  hostLink = {
    organizationId: form.orgId,
    defaultAssistantId: form.assistantId,
    // campos opacos — módulo no los conoce
  }
  await guildLinkStore.save(form.guildId, hostLink)

  inviteUrl = buildBotInviteUrl({ guildId: form.guildId })
  return { inviteUrl }
}
```

### 7. Auth gate (runtime bot)

```pseudo
function registerAuthGateHandlers(chat, config) {

  async function gate(thread, message, kind) {
    event = normalizeDiscordEvent(thread, message, kind)

    guildLink = event.guildId
      ? await config.guildLinkStore.get(event.guildId)
      : null

    userLinks = await config.userLinkStore.findByDiscordId(event.discordUserId)

    resolved = await config.authPolicy.resolve({ event, guildLink, userLinks })

    if !resolved.authorized {
      await config.onUnauthorized({}, thread, resolved.reason)
      return
    }

    if kind === 'mention':
      await thread.subscribe()

    await config.onAuthorizedMessage(resolved.hostContext, thread, message)
  }

  chat.onNewMention((t, m) => gate(t, m, 'mention'))
  chat.onDirectMessage((t, m) => gate(t, m, 'dm'))
  chat.onSubscribedMessage((t, m) => gate(t, m, 'subscribed'))
  chat.onSlashCommand(/* registered commands */ (e) => gate(e.thread, e.message, 'slash'))
}
```

### 8. Default auth policy (Flywheel / PoC mapping)

```pseudo
authPolicy = createDefaultAuthPolicy({
  membershipResolver: async (discordUserId, guildLink) => {
    // Host: profile en org del guildLink.organizationId
    return supabaseProfileLookup(discordUserId, guildLink.organizationId)
  },
  superadminBypass: async (discordUserId) => {
    return supabaseSuperadminByDiscordId(discordUserId)
  },
  mapAuthorizedUser: (linkedUser, input) => ({
    profile: linkedUser,
    guildLink: input.guildLink,
    assistantId: resolveAssistant(input),   // lógica Flywheel
  }),
})
```

### 9. Callbacks del host (Flywheel)

```pseudo
onAuthorizedMessage: async (ctx, thread, message) => {
  await processChatMessage({
    profile: ctx.profile,
    assistantId: ctx.assistantId,
    text: message.text,
    discordThreadKey: thread.id,
  })
}

onUnauthorized: async (_, thread, reason) => {
  const copy = {
    UNLINKED_GUILD: 'Servidor no vinculado…',
    USER_NOT_LINKED: 'Conectá Discord en Settings…',
    AMBIGUOUS_DM: 'Tenés varias orgs…',
    // ...
  }
  await thread.post(copy[reason])
}
```

### 10. Gateway worker (D4)

```pseudo
async function runDiscordGatewayWorker({ module, webhookBaseUrl, sessionDurationMs }) {
  discord = module.chat.getAdapter('discord')
  webhookUrl = `${webhookBaseUrl}/api/webhooks/discord`

  forever:
    try:
      await discord.startGatewayListener(webhookUrl, { durationMs: sessionDurationMs })
    catch err:
      log(err)
      sleep(backoff)
}

// Host: Railway / pnpm discord:gateway — mismo REDIS_URL + DISCORD_* que la app
```

### 11. Montaje Next.js App Router (host)

```pseudo
// app/api/webhooks/discord/route.ts
export const POST = module.handlers.webhook

// app/api/auth/discord/connect/route.ts
export const GET = module.handlers.auth.connect

// app/api/auth/discord/callback/route.ts
export const GET = module.handlers.auth.callback

// app/api/auth/discord/guilds/route.ts
export const GET = module.handlers.auth.guilds
```

### 12. Checklist de viabilidad

| Criterio | Veredicto |
|----------|-----------|
| Modularización (D1 frontera clara) | ✅ |
| Reusabilidad entre apps | ✅ — strategies + policy defaults |
| Strategy pattern bien aplicado | ✅ — stores + authPolicy; no if/switch de proveedores |
| Alineado con Chat SDK | ✅ — Chat, adapter, webhooks, handlers estándar |
| Practicidad (PoC → módulo) | ✅ — mapeo directo desde discord-poc |
| Riesgo over-engineering | ⚠️ mitigado — defaults + escape hatch; empezar con 1 app consumidora |

---

## Mapeo discord-poc → módulo

| PoC actual | Rol en módulo |
|------------|---------------|
| `lib/discord/oauth.ts` | Helpers + handlers OAuth empaquetados |
| `lib/discord/bot.ts` handlers | `registerAuthGateHandlers` interno |
| `lib/discord/bot.ts` auth logic | `createDefaultAuthPolicy` + callbacks host |
| `lib/chat/pipeline.ts` | `onAuthorizedMessage` / `onUnauthorized` (host) |
| `lib/discord/thread-assistant.ts` | `mapAuthorizedUser` (host) |
| `lib/discord/gateway-worker.ts` | `runDiscordGatewayWorker` |
| `app/api/auth/discord/*` | `module.handlers.auth.*` |
| `app/api/webhooks/discord` | `module.handlers.webhook` |
| `profiles.discord_user_id` | `UserLinkStore` (host impl) |
| `discord_guild_links` | `GuildLinkStore<HostLink>` (host impl) |

## Notas del PoC actual

- OAuth scopes: `identify` (connect user), `guilds` (list servers for admin)
- Tablas: `profiles.discord_user_id`, `discord_guild_links` (guild → org + default assistant)
- Bot valida member vía policy/callbacks; mensajes rechazados si no hay link
- Gateway WebSocket es requisito operativo para mensajes de canal (no solo Interactions URL)
- Interactions Endpoint URL sigue siendo necesaria para slash commands e interactions

## Próximos pasos

1. Extraer paquete `@scope/discord-chat-sdk` (monorepo o repo aparte).
2. Migrar `discord-poc` como primer consumidor (stores Supabase + policy Flywheel).
3. Validar en prod: Vercel app + Railway gateway + Redis compartido.

## Referencias

- [Chat SDK docs](https://chat-sdk.dev/docs)
- [Strategy Pattern — Refactoring Guru](https://refactoring.guru/design-patterns/strategy)
- PoC: `Documents/flywheel/discord-poc`
