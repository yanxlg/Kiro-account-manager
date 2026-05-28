# Kiro Account Manager

<p align="center">
  <img src="Kiro-account-manager/resources/icon.png" width="128" height="128" alt="Kiro Logo">
</p>

<p align="center">
  <strong>QQ Group: 653516618</strong>
</p>

<p align="center">
  <img src="Kiro-account-manager/src/renderer/src/assets/交流群.png" width="200" alt="QQ Group">
</p>

<p align="center">
  <strong>A powerful multi-account management tool for Kiro IDE</strong>
</p>

<p align="center">
  Quick account switching, auto token refresh, group/tag management, machine ID management and more
</p>

<p align="center">
  <strong>English</strong> | <a href="README_CN.md">简体中文</a>
</p>

---

## ✨ Features

### 🔐 Multi-Account Management
- Add, edit, and delete multiple Kiro accounts
- One-click quick account switching
- Support Builder ID, IAM Identity Center (SSO) and Social (Google/GitHub) login methods
- Batch import/export account data

### 🔄 Auto Refresh
- Auto refresh tokens before expiration
- Auto update account usage and subscription info after refresh
- Periodically check all account balances when auto-switch is enabled

### 📁 Groups & Tags
- Flexibly organize accounts with groups and tags
- Batch set groups/tags for multiple accounts
- One account can only belong to one group, but can have multiple tags

### 🔑 Machine ID Management
- Modify device identifier to prevent account association bans
- Auto switch machine ID when switching accounts
- Assign unique bound machine ID to each account
- Backup and restore original machine ID

### 🔄 Auto Account Switch
- Auto switch to available account when balance is low
- Configurable balance threshold and check interval

### 🎨 Personalization
- 21 theme colors available (grouped by color family)
- Dark/Light mode toggle
- Privacy mode to hide sensitive information

### 🌐 Proxy Support
- Support HTTP/HTTPS/SOCKS5 proxy
- All network requests through proxy server

### 🔄 Auto Update Detection
- Auto detect latest version from GitHub
- Show update content and download file list
- One-click to download page

---

## 📸 Screenshots

### Home
Shows account statistics, current account details, subscription info and quota breakdown.

![Home](Kiro-account-manager/resources/主页.png)

### Account Management
Manage all accounts, search, filter, batch operations, one-click switch.

![Account Management](Kiro-account-manager/resources/账户管理.png)

### Machine ID Management
Manage device identifier, prevent account association bans, backup and restore.

![Machine ID Management](Kiro-account-manager/resources/机器码管理.png)

### Settings
Configure theme colors, privacy mode, auto refresh, proxy and more.

![Settings](Kiro-account-manager/resources/设置.png)

### API Proxy Service
Provides OpenAI and Claude compatible API endpoints with multi-account rotation, auto token refresh, request retry and more.

![API Proxy Service](Kiro-account-manager/resources/API%20反代服务.png)

### Kiro IDE Settings
Sync Kiro IDE settings, edit MCP servers, manage user rules (Steering).

![Kiro Settings](Kiro-account-manager/resources/Kiro%20设置.png)

### About
View version info, feature list, tech stack and author info.

![About](Kiro-account-manager/resources/关于.png)

---

## 📥 Installation

### Windows
Simply run the `.exe` installer.

### macOS
Since the app is not code-signed by Apple, macOS will show "damaged and can't be opened" on first launch. Please follow these steps:

**Method 1: Terminal Command (Recommended)**
```bash
xattr -cr /Applications/Kiro\ Account\ Manager.app
```

**Method 2: Right-click Open**
1. Find the app in Finder
2. Hold `Control` and click the app (or right-click)
3. Select "Open"
4. Click "Open" in the dialog

### Linux
- **AppImage**: Add execute permission and run directly
  ```bash
  chmod +x kiro-account-manager-*.AppImage
  ./kiro-account-manager-*.AppImage
  ```
- **deb**: Install with `dpkg -i`
- **snap**: Install with `snap install`

---

## 📖 Usage Guide

### Add Account

1. Click "Account Management" to enter account list page
2. Click "+ Add Account" button in the top right
3. Enter SSO Token or OIDC credentials
4. Click confirm to complete

### Switch Account

1. Find the target account in Account Management page
2. Click the power icon on the account card to switch
3. Kiro IDE will use the new account after switching

### Batch Set Groups/Tags

1. Select multiple accounts in Account Management page
2. Click "Group" or "Tag" button
3. Select groups/tags to add or remove in the dropdown menu

### Machine ID Management

1. Click "Machine ID" on the left sidebar
2. Original machine ID will be auto backed up on first use
3. Click "Generate Random & Apply" to change machine ID
4. Click "Restore Original" to restore if needed

> ⚠️ **Note**: Modifying machine ID requires admin privileges, please run the app as administrator

### Import/Export

- **Export**: Settings → Data Management → Export, supports JSON, TXT, CSV, Clipboard formats
- **Import**: Settings → Data Management → Import, restore account data from JSON file

---

## 🛠️ Tech Stack

- **Framework**: Electron + React + TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Icons**: Lucide React

---

## 💻 Development Guide

### Requirements

- Node.js >= 18
- npm >= 9

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

### Build Application

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

### Build Multi-Architecture

```bash
# Windows 64-bit
npx electron-builder --win --x64

# Windows 32-bit
npx electron-builder --win --ia32

# Windows ARM64
npx electron-builder --win --arm64

# macOS Intel
npx electron-builder --mac --x64

# macOS Apple Silicon
npx electron-builder --mac --arm64

# Linux 64-bit
npx electron-builder --linux --x64

# Linux ARM64
npx electron-builder --linux --arm64
```

---

## 🚀 Auto Build (GitHub Actions)

The project is configured with GitHub Actions workflow for auto building all platforms and architectures:

### Supported Platforms

| Platform | Architecture | Format |
|----------|--------------|--------|
| Windows | x64, ia32, arm64 | exe, zip |
| macOS | x64, arm64 | dmg, zip |
| Linux | x64, arm64, armv7l | AppImage, deb, snap |

### Trigger Methods

1. **Push Tag**: Auto build and release when pushing `v*` format tags
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

2. **Manual Trigger**: Manually run workflow in GitHub Actions page

---

## 📋 Changelog


### v1.7.0 (2026-5-28) — Security Hardening + Major Feature Expansion

> This release packs 70+ improvements covering reverse-proxy security hardening, batch registration concurrency isolation, SOCKS proxy support, unified task center, webhook notifications, analytics reporting, one-click diagnostics, config import/export, and major performance optimizations.

#### 🛡️ Reverse-Proxy Security Hardening (21 fixes)

**P0 Critical Security**
- **Fix**: `readBody` now enforces a max body size (default 10MB), rejects oversized Content-Length early + breaks connection on stream overflow → HTTP 413 (DoS protection)
- **Fix**: Refuse to start when `host=0.0.0.0`/`::` without any API Key; red banner in UI + explicit `allowExternalWithoutApiKey` flag required to bypass
- **Fix**: API Key comparison now uses `crypto.timingSafeEqual` to prevent timing-attack key guessing
- **Fix**: 5xx responses return generic "Internal server error"; auto-sanitize Bearer/access_token/JWT/system paths
- **Fix**: `/admin/config` GET masks `apiKeys[].key` plaintext, showing only `xxxx***last4`

**P1 Operations & Observability**
- **New**: IP allowlist / denylist (single IP + IPv4/IPv6 CIDR)
- **New**: Critical proxy events trigger webhooks (account suspended / all accounts exhausted, with 5-min dedup)
- **New**: `/admin/config` POST field allowlist, blocks remote mutation of port/host/apiKeys/tls
- **New**: Per-API-Key / per-IP request rate limit (sliding window, configurable)
- **New**: Session affinity (route same `conversation_id` to same account → preserve prompt cache + anti-risk-control)
- **New**: keep-alive / headers idle timeout (default 65s/60s, configurable)
- **New**: One-click TLS self-signed certificate generation (2-year validity + SAN covers localhost/127.0.0.1/::1/user host)
- **New**: Graceful `stop()` (5s grace period → activeRequests.abort → socket.destroy)
- **New**: Log sanitization (removes Bearer/access_token/JWT/system path fragments)

**P2 Advanced**
- **New**: Prometheus `/metrics` endpoint (8 core metrics: requests/tokens/credits/accounts/uptime)
- **New**: Proxy audit log (rolling 200 entries + `/admin/audit` GET + `enableAuditLog` toggle)
- **New**: API Key → Account allowlist (`apiKeyAccountBindings`: apiKey id → allowed account id array)
- **New**: HTTP + HTTPS dual-port (with TLS enabled, listen HTTP on `fallbackPort` simultaneously)
- **New**: Configurable `recentRequests` limit (default 100, max 10000)
- **New**: Mark restart required on port/host/tls changes + one-click restart button in UI
- **New**: Stream response socket-level backpressure monitoring

**New files**: `src/main/proxy/selfSignedCert.ts`, `ProxySecurityPanel.tsx`
**New IPC**: `proxySelfSignedCertInfo` / `proxySelfSignedCertRegenerate` / `proxyNeedsRestart` / `proxyRestart` / `proxyAuditLog` / `onProxyWebhookTrigger`

#### 🌐 Multi-Protocol Proxy Support

- **New**: SOCKS5 / SOCKS5h / SOCKS4 / SOCKS4a proxy support (via `socks` library + undici custom Agent + TLS upgrade)
- **New**: Account-Proxy N:1 binding (reverse-proxy bucketing, multiple accounts share single IP to reduce risk-control correlation)
- **New**: All account requests (token refresh, background check, Kiro API) go through bound proxy
- **New**: Advanced proxy pool search (9-field full-text: host / port / protocol / user / label / email / url / tags / source)
- **New**: Multi-dimensional filtering (protocol / enabled status / latency range / last validation time) with live match count

#### 🚀 Batch Registration Major Upgrade

**Concurrency Isolation Fixes**
- **Fix**: Outlook concurrent email contention (frontend pre-shuffles outlookData + each task takes one line exclusively; main process compatible with single/multi-line)
- **Fix**: Mixed mode source selection only effective once (each task independently calls `buildAutoConfig`, weight rotation now actually works)
- **Fix**: Registration history "Direct connection" false report (`resolvedProxyUrl()` now includes system/env proxies)

**Feature Expansion**
- **New**: Rate limiter (token bucket) + exponential backoff + success rate monitoring
- **New**: Failure retry queue (by error type: network / otp_timeout / email_used / rate_limit / auth / risk_control)
- **New**: Auto-detect AWS risk control ("TEMPORARILY_SUSPENDED" / "please try again later") + auto-pause batch
- **New**: Email pre-validation blacklist (auto-add used emails, skip to save time)
- **New**: Mixed email source weighted round-robin (SWRR algorithm, same as nginx)
- **New**: Daily registration quota + cron-style scheduled launch
- **New**: Registration strategy templates (save/apply/import/export)
- **New**: Dynamic 6-8 step progress bar (auto-adjusts based on `batchAutoImport` and `autoFetchProLink`)
- **Fix**: Chinese mojibake errors during registration (tlsclientwrapper Latin-1 → UTF-8 re-decoding)
- **Remove**: MoEmail registration mode (no longer useful)

#### 📊 Task Center + Webhooks

- **New**: Unified task center (`useTaskStore`, titlebar entry + drawer UI)
- **New**: Task state machine: running / paused / success / failed / cancelled
- **New**: Persisted finished tasks (saved to localStorage)
- **New**: Cancel All button / progress bars / sub-task details
- **New**: Webhooks (DingTalk / Telegram / Discord / Slack / Generic JSON)
- **New**: Webhook retry (3 attempts with exponential backoff) + rate limit (20 msg/min/webhook)
- **New**: Critical proxy events → Webhook (suspended / all exhausted)

#### 🩺 One-Click Diagnostics

- **New**: Diagnostics page (network / Kiro API / email service / proxy / custom endpoint connectivity)
- **New**: Custom probe URL (replaces MoEmail field; any HTTP/HTTPS endpoint accepted)
- **New**: Run diagnostics through proxy + report export (clipboard)
- **New**: Auto-migrate legacy MoEmail config to new probe URL key

#### 🔧 Subscription Management

- **New**: Bulk subscription pre-flight check (eligibility + report)
- **New**: Cancel / downgrade / renew entries
- **New**: Subscription link expiry detection (HTTP HEAD probe + generatedAt timestamp)
- **New**: Manage Subscriptions tab (bulk open portal + one-click disable overage)
- **New**: Subscribed accounts virtual list (@tanstack/react-virtual)

#### 📈 Analytics Reports

- **New**: Registration analytics report (success/fail donut + 24h smooth curve + 7-day trend)
- **New**: Error classification stats (OTP timeout / network / email used / rate limit / risk control)
- **New**: CSV export

#### 📦 Config Import / Export

- **New**: One-click full config export (accounts / proxies / webhooks / strategy templates)
- **New**: AES-GCM encrypted export (KCFG format, PBKDF2-SHA256 key derivation)
- **New**: Cross-device config sync

#### ⚡ Performance Optimization (Anti-Lag)

**I/O & Persistence**
- **Optimize**: `saveToStorage` 500ms debounce + `flushSaveImmediately` force-flush API
- **Optimize**: `createBackup` 5-minute throttle (previously backed up on every save)
- **Optimize**: `ProxyLogStore` async `fs.promises.writeFile` + 30s throttle + maxLogs 1M → 50K
- **Optimize**: `proxy-account-suspended` IPC updates memory snapshot only, deferred disk write
- **Optimize**: SSO accounts `queueMicrotask` async loading (no longer blocks loadFromStorage)

**Render & Compute**
- **Optimize**: `getFilteredAccounts` / `getStats` / `activeAccount` module-level memoization
- **Optimize**: `applyBackgroundRefreshResults` / `applyBackgroundCheckResults` batch merge (120ms buffer)
- **Optimize**: `importAccounts` / `importFromExportData` single set call
- **Optimize**: `updateTrayInfo` 400ms debounce
- **Optimize**: `AccountToolbar` selection status with `useMemo` + `useCallback`
- **Optimize**: Proxy pool / accounts / subscriptions use virtual list (`@tanstack/react-virtual`, only render visible area)

#### 🐛 Critical Bug Fixes

- **Fix**: `Invalid URL protocol` (Windows registry ProxyServer multi-protocol string parsing, take only HTTP/HTTPS)
- **Fix**: `tls-client-wrapper` DLL moved to `userData/tls-client/` for permanent storage (was in `%TEMP%`, could be cleaned by system)
- **Fix**: Network response Latin-1 → UTF-8 conversion (Chinese errors display correctly)
- **Fix**: `proxyServer.stop()` socket force-destroy was too early, truncating responses
- **Fix**: Memory leaks (rate limit buckets / session affinity entries auto-cleaned every 5 min)

#### 🆕 New Pages

- **`ProxyPoolPage`** — Proxy pool management + advanced search + account binding + scheduled validation
- **`WebhooksPage`** — Webhook configuration + testing + event subscription
- **`DiagnosePage`** — One-click diagnostics (network / API / email / proxy / custom)
- **`ConfigSyncPage`** — Config import/export + AES-GCM encryption

#### 🔧 Theme & UI

- **New**: Task center button (titlebar) + global progress display
- **New**: Reverse-proxy "Security & Observability (v1.8)" card (collapsible, unified entry for new settings)
- **Improve**: Failure error code localized display
- **Improve**: Dangerous binding (0.0.0.0) auto-show red warning + risk confirmation toggle

#### 🔄 ProxyAccount Data Model Extension

- New `proxyUrl` field (account-bound egress proxy)
- New `machineId` field (account-bound device ID)

#### 📋 New ProxyConfig fields (14 items)

`maxRequestBodyBytes` / `allowedIPs` / `deniedIPs` / `allowExternalWithoutApiKey` / `rateLimitPerKeyPerMinute` / `sessionAffinityEnabled` / `keepAliveTimeoutMs` / `headersTimeoutMs` / `recentRequestsLimit` / `enableMetrics` / `apiKeyAccountBindings` / `fallbackPort` / `enableAuditLog` / `apiKeyGroupBindings`(deprecated)


### v1.6.9 (2026-5-24)

#### Full Theme Adaptation
- **Refactor**: All dialog/card hardcoded colors replaced with theme/semantic tokens — `text-green-500/600` → `text-success`, `text-red-500/600` → `text-destructive`, `text-amber/orange-500/600` → `text-warning`, decorative `bg-blue-50/...` → `bg-primary/[0.04~0.15]`
- **Scope**: AccountDetailDialog, AccountCard, AccountListRow, ModelsDialog, AccountSelectDialog, ProxyLogsDialog, ProxyDetailedLogsDialog, ApiKeyUsageDialog, ClientConfigDialog, EditAccountDialog, SteeringEditor, AddAccountDialog, ApiKeyManager, ProxyPanel — 14+ components
- **Refactor**: `_helpers.ts` `getStatusBadgeClass` status colors fully tokenized with auto dark mode support
- **Optimization**: All dialogs/cards now instantly follow theme color changes — no more "some elements don't update on theme switch"

#### Account Card Solid Background
- **New**: `--card-solid` CSS variable (light `#FFFFFF` / dark `#1A2236`) — dedicated opaque background for account cards
- **New**: `.bg-solid-card` utility class with dual-class selector (`.glass-card.bg-solid-card`) to override glass-card transparent background and disable `backdrop-filter`
- **Fixed**: Theme color (e.g. orange) bleeding through 72% transparent `bg-card` into account data area causing "tinted overlay" effect
- **Preserved**: Other glass elements (dialog/popover/toolbar/sidebar/KIRO quota cards) retain `bg-card` transparency

#### List/Card View Visual Improvements
- **Refactor**: Tag chips changed from solid fill to translucent outlined style (12% tag color background + tag color text + 30% tag color border), more subtle
- **Refactor**: `generateRowGlowStyle` single-tag case removes horizontal background gradient, keeping only left 3px color stripe; multi-tag keeps vertical gradient stripe
- **Fixed**: Card/list row selection state overridden by multi-tag inline style (`box-shadow`/`background`) causing no visual feedback — switched to absolutely positioned overlay layer (`absolute inset-0 ring-2 ring-inset ring-primary/60 bg-primary/[0.08] z-10`) isolated from inline style
- **Optimization**: Selection state enhanced to `ring-2 ring-primary/60` + `bg-primary/[0.08]` + primary shadow

#### Group Management Refactor (Independent View Mode)
- **New**: `useAccountsStore` added `activeGroupTab` state (`'all' | 'ungrouped' | <groupId>`) with localStorage persistence — replaces multi-select filter logic
- **New**: `getFilteredAccounts()` filters by `activeGroupTab` first (mutually exclusive)
- **Refactor**: Toolbar "Group" button now a 3-in-1 menu — Switch View / Bulk Move / Manage Groups
  - Button text dynamically shows current tab name + color dot + count
  - Dropdown menu uses 2-column compact grid to save vertical space
  - User groups listed once (merged switch and bulk move zones)
  - When accounts are selected, hovering a tile reveals end-of-row ⇄ button to bulk move
- **Removed**: AccountFilter group chip multi-select zone (eliminates dual-control conflict with tabs)
- **Fixed**: Dropdown menu obscured by cards — `<header>` got `relative z-20` to elevate stacking context (`.glass-toolbar`'s backdrop-filter creates isolated z layer)

#### Account Toolbar Compactness
- **Refactor**: 6 toolbar buttons (tags/privacy/filter/check/delete/refresh) changed to icon-only + tooltip mode (`size="icon" h-8 w-8`), saving ~280px width
- **Optimization**: Tags button selected state uses primary color dot (6px) instead of `ChevronDown`, more restrained
- **Optimization**: Delete button hover turns `bg-destructive/10` red as warning
- **Optimization**: Tooltips dynamically show selected count (e.g. "Delete 5 selected accounts"), disabled state hints "select first"
- **New**: Standalone "Clear Selection" X button (only shown when selected), red hover hint
- **Preserved**: Group button (with current tab name) + Select All button (with count) keep text for information value

#### Pro Plan Customization in Registration Page
- **New**: `ProPlanType` type — Pro / Pro+ / Power, mapped to Kiro backend `Q_DEVELOPER_STANDALONE_{PRO|PRO_PLUS|POWER}` qSubscriptionType
- **New**: 3-choice chip buttons (blue/purple/gold business colors) added below "Auto-fetch Pro subscription link" toggle, localStorage persistent
- **Refactor**: `fetchProSubscriptionUrl` uses user-selected plan type instead of hardcoded PRO

#### Proxy Server Enhancements
- **Fixed**: Multi-account mode "expired token accounts never refreshed" bug — `accountPool.isAccountAvailable` only marks accounts unavailable when `refreshToken` is missing; expired accounts with refreshToken pass through to `proxyServer.getAvailableAccount` for refresh; refresh failures auto-isolated via `markNeedsRefresh` forming a closed loop
- **New**: `ProxyConfig` added `multiAccountSelectionMode: 'all' | 'groups'` and `multiAccountGroupIds: string[]` fields
- **New**: Multi-account rotation added "Scope" config — All Accounts / Specific Groups (chip multi-select including "Ungrouped" special option)
- **New**: `syncAccounts` filters accounts by selected groups in multi-account + groups mode
- **New**: Proxy panel UI added "Scope" toggle + group chips (user group colors + counts) + real-time account count preview
- **Sync**: Preload IPC types synced (`multiAccountSelectionMode` / `multiAccountGroupIds` / `accountSelectionStrategy`)

#### Proxy Panel UI Compactness
- **Refactor**: Basic config + API Key merged into 1 row 12-column grid — Port(2) + Host(3) + API Key(7)
- **Refactor**: API Key operation buttons (sk-xxx format selector / random generate / copy / manage) all `icon-only h-7 w-7` moved to Label row right side
- **Refactor**: Advanced settings changed from 2 to 3 columns, all description `<p>` tags moved to Label `title` tooltip (saves 30-40% vertical space)
- **Refactor**: Token Buffer toggle + number input merged into `col-span-3` row (`[Auto-trim toggle 160px][Number input flex-1]`)
- **Optimization**: Mode toggle row changed from `flex-wrap` to `grid-cols-3`, 3 toggles (auto-switch/log requests/stream events) on one row
- **Fixed**: `sk-xxx` dropdown `h-6` clipped by Select's internal `py-2` — used Tailwind arbitrary attribute selector `[&>button]:h-7 [&>button]:py-0 [&>button]:px-2.5` to force override
- **Optimization**: Advanced settings header added `Settings2` icon + `uppercase tracking-wider` minimalized

#### Bug Fixes
- **Fixed**: `AccountManager.tsx` trailing extra `}` causing TypeScript syntax error
- **Optimization**: `AccountFilter.tsx` cleaned up unused `groups` destructuring

### v1.6.8 (2026-5-23)

#### Token Counting Precision Refactor
- **New**: Standalone `tokenCounter.ts` module — encapsulates `js-tiktoken` `cl100k_base` encoder and `getModelContextLength` function, unifying all token computation logic
- **New**: Multi-tier precision chain — Kiro backend `tokenUsage` real value > `contextUsageEvent` percentage reverse calculation (`modelCtx × percentage / 100`) > `tiktoken` precise count > character-based fallback (input 0.42, output 0.4)
- **Optimization**: Input token estimation error reduced from ~30% to ~5% (Sonnet 4.5 measured 17871 → 19608, perfectly aligned with official 12.7% contextUsage)
- **Optimization**: Output token statistics now accumulate `assistantResponseEvent` / `codeEvent` text and apply tiktoken, no longer relying on character length
- **New**: `getModelContextLength` 3-tier lookup chain — Kiro `fetchKiroModels`'s real `maxInputTokens` cache first → fuzzy match (`claude-sonnet-4.5` ↔ `claude-sonnet-4-5-20251001`) → keyword fallback (sonnet/haiku/opus/gpt-4 etc.)
- **New**: AmazonQ CLI endpoint `CodeEvent` parsing support — fixes lost streaming code content on this endpoint
- **Optimization**: `parseEventStream` signature extended with `modelId` and `payloadStr` parameters for end-to-end model context propagation enabling contextUsage reverse calculation
- **Fixed**: Removed duplicate `modelContextWindowCache` definition in `kiroApi.ts`; unified import and re-export from `tokenCounter.ts` for backward compatibility

#### Token Buffer Reserve Toggle (Off by Default)
- **Changed**: ⚠️ **`tokenBufferReserve` behavior change** — v1.6.7 force-enabled 50K reserve; v1.6.8 makes it an opt-in toggle, **off by default**, default value lowered to 20K when enabled
- **New**: `enableTokenBufferReserve` standalone switch — new field in `ProxyConfig`, frontend UI adds inline Switch control
- **Behavior**: When off, `trimHistoryByTokens` is **completely skipped**; `CONTENT_LENGTH_EXCEEDS_THRESHOLD` from Kiro backend is forwarded as-is to the client
- **Behavior**: When on, effective limit = `model.maxInputTokens - tokenBufferReserve` (200K → 180K, 1M → 980K, range 5K~150K)
- **UI**: Number input `disable` condition extended with `!enableTokenBufferReserve` — input auto-greys when switch off; all related controls locked while server is running
- **Compat**: Existing 50K values in stored config are preserved (still in 5K~150K range), but won't trigger trimming because the switch is off by default; users must manually enable

#### Proxy URL Tolerance
- **New**: `normalizeProxyUrl` utility — auto-normalizes user-input non-standard proxy URLs (e.g. `http:127.0.0.1:7890` missing `//`, `127.0.0.1:7890` missing scheme, leading/trailing whitespace) into standard `http://host:port` format
- **Optimization**: Environment variables (`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`), Electron `session.setProxy`, and frontend UI now consistently use the normalized URL, avoiding proxy failure or duplicate setup
- **Optimization**: IPC `set-proxy` returns `normalizedUrl` to frontend store, auto-writing back to UI input for visual confirmation

#### Feature Trim
- **Removed**: "Auto Continue Rounds / Server-side tool auto continue" full feature chain — 14 references cleared (frontend UI controls, `ProxyConfig` fields, IPC `proxyStart`/`proxyUpdateConfig` type signatures, backend OpenAI `handleOpenAIStream` and Claude `handleClaudeStream` auto-continue branches)
- **Behavior**: Stream tool calls now return `tool_calls` / `tool_use` directly to client after completion; client decides what to do next, no more server-side "fake continue" recursive call path
- **Rationale**: This feature conflicted with mainstream API clients (Cline / Roo / Cursor / Claude Code) tool execution loops, and was mutually exclusive with the recommended `clientDrivenToolExecution=true` configuration; long unused

#### Bug Fixes
- **Fix**: 🔥 `electron-builder` build error `ENOENT: no such file or directory, rename 'electron.exe' -> 'kiro-account-manager.exe'` — root cause was incomplete `electron-v38.7.2-win32-x64.zip` download from npmmirror corrupting the Electron binary; switched to BITS download from `cdn.npmmirror.com/binaries/electron/` for full zip
- **Fix**: Registration `app.js` download triggers `RangeError: init["status"] must be in the range of 200 to 599, inclusive.` — `tlsclientwrapper` returned `status=0/undefined` on network errors, triggering `new Response()` validation exception. Switched to `undici fetch` for static resources to bypass tls-client and avoid polluting its global state
- **Fix**: OIDC registration fails with `failed to build client out of request input: failed to modify existing client: no tls client for modification check` when proxy enabled — `app.js` download failure polluted the tls-client DLL global state, causing subsequent `SessionClient` initialization to fail. Auto-resolved by the `app.js` undici fix above
- **Fix**: Frontend `setProxy` changed to async function — awaits normalized URL from IPC and writes back to store for display, preventing UI/effective value mismatch

### v1.6.7 (2026-5-23)

#### Account Suspension Handling (NEW)
- **New**: Full TEMPORARILY_SUSPENDED detection pipeline — proxy server now recognizes Kiro backend risk-control errors (`403 + reason:"TEMPORARILY_SUSPENDED"`), `AccountSuspendedException` (CodeWhisperer), and `423 Locked` responses
- **New**: `ProxyAccount` gains `suspendedAt` / `suspendReason` / `suspendMessage` fields to track long-term bans (distinct from temporary `errorCount` cooldown)
- **New**: `AccountPool` adds `isSuspended` / `markSuspended` / `clearSuspended` — suspended accounts are permanently skipped in `isAccountAvailable` until manually cleared or `reset()`
- **New**: `onAccountSuspended` event + IPC `proxy-account-suspended` — full bridge from proxy server → main → preload → renderer store → UI
- **New**: Suspension state persisted to `store.accountData[id].lastError` and `status='error'` — survives app restart
- **New**: Auto-switch to next available account when current is suspended (works in both multi-account and single-account+auto-switch modes)
- **Improved**: Unified `isBannedAccountError` across `store/accounts.ts` / `AccountSelectDialog` / `AccountCard` — all three now recognize `temporarily_suspended` / `temporarily suspended` / `User ID is suspended` patterns and display the ban banner
- **New**: Manual unsuspend UI — `AccountCard` ban-detail dialog now has a `Reset Suspended` button that calls IPC `proxy-clear-account-suspended` → clears `accountPool` suspended flag + wipes `store.accountData[id].lastError` + sets `status='active'`
- **Fixed**: `accountPool.addAccount` previously always forced `isAvailable=true`, which would silently wipe out the suspended state if an account was re-added (e.g., after `proxy-sync-accounts`). Now `addAccount` respects the incoming `suspendedAt` field and preserves `isAvailable=false`, so suspended accounts re-added from persisted data stay correctly skipped.

#### LAN Access Fix (Issue #75)
- **Fixed**: 🔥 **Cannot access proxy via LAN after upgrading from 1.5.0 to 1.6.x** — root cause: default `host` was `127.0.0.1` (loopback only) and the UI "Public" toggle was `disabled` while the server was running, so users couldn't switch without stopping the service
- **Fixed**: "Public" switch in Proxy Panel is now clickable even while the server is running — toggling automatically stops + starts the proxy to apply the new host binding within ~300ms
- **Improved**: Service address now displays `http://localhost:5580` instead of `http://0.0.0.0:5580` (the latter is not a valid client target); copy-address button uses the same human-readable form
- **Improved**: Inline hints below the host field — loopback mode tells users how to enable LAN access; public mode warns to set an API Key and allow the port through the firewall
- **Improved**: When public mode is active, a secondary tip below the service address shows `LAN devices use http://<this-machine-IP>:<port>`

#### UI Improvements
- **New**: 🎨 **Premium SaaS Glassmorphism Redesign** — full design system overhaul inspired by Linear / Raycast / Vercel:
  - **Design tokens**: background `#f4f7fb`, primary `#5B8CFF`, violet accent `#8B5CF6`, success `#22C55E`, translucent white borders `rgba(255,255,255,0.4)`
  - **Frosted glass system**: new `.glass-card` / `.glass-card-strong` / `.glass-card-subtle` / `.glass-sidebar` / `.glass-toolbar` utility classes with `backdrop-filter: blur(24px) saturate(180%)`
  - **Floating sidebar**: Sidebar now floats with `rounded-3xl` (24px), glass backdrop, framer-motion spring width animation, layoutId-based active pill morph (primary → violet gradient)
  - **Ambient light background**: dual radial gradients (blue + violet) animated with 22s/26s float keyframes — soft 80px blur, auto-dimmed in dark mode
  - **Card defaults**: `<Card>` now defaults to glass variant with `rounded-2xl` (24px), supports `variant=glass/glass-strong/glass-subtle/solid/elevated` and `interactive` prop for hover-lift animation (translateY -2px + enhanced shadow)
  - **Page hero unification**: all 8 pages (Home / Accounts / Settings / Proxy / KProxy / KiroSettings / Subscription / Register / About / MachineId) now use `.page-hero` class with consistent 24px rounded glass header
  - **Transparent toolbars**: AccountManager header uses `glass-toolbar` (16px blur + subtle bg + border-bottom only)
  - **Page transitions**: `AnimatePresence` + `motion.div` wraps page content with fade + 8px Y-axis spring transition on route change
  - **Dark mode**: deep navy `#0a0e1a` background with glass surfaces tuned for low-light readability
  - **Dependencies**: added `framer-motion ^11.x` for declarative animations
- **Fixed (Glassmorphism polish)**: page scroll regression — `motion.div` wrapper now uses `h-full flex flex-col` so child page's `flex-1 overflow-auto` works correctly
- **Improved (Glassmorphism polish)**:
  - All 33 instances of `<Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">` across `HomePage` / `SettingsPage` / `AboutPage` / `RegisterPage` / `KiroSettingsPage` / `ProxyPanel` replaced with `hover-lift` — default glass variant now fully visible
  - 4 hand-rolled Dialog containers (`UpdateDialog` / `CloseConfirmDialog` / `AccountDetailDialog` / `ProxyDetailedLogsDialog`) switched from `bg-background rounded-xl border` to `glass-card-strong rounded-2xl` + backdrop-blur overlay
  - `Button` component reworked: `rounded-xl` default, `transition-all 200ms`, hover `-translate-y-px` + ring-color glow on `default`/`destructive` variants, new `gradient` variant (theme-aware `gradient-bg-primary` + `breathe-glow` animation), new `cta` size (h-12 rounded-2xl) for primary call-to-actions
  - **All 21 themes now have theme-aware active-pill gradient** — each theme defines `--gradient-from` / `--gradient-to` pair (purple/emerald/orange/rose/cyan/amber/teal/indigo/lime/pink/slate/zinc/sky/violet/fuchsia/red/yellow/green/stone/neutral + default). Sidebar's `motion.span layoutId="sidebar-active-pill"` reads from CSS vars, so the active menu pill morphs through the selected theme's hue gradient (e.g., emerald theme → teal-green gradient instead of fixed blue→violet)
  - `gradient-bg-primary` and `gradient-border` utility classes now use `var(--gradient-from/-to)` so all gradient buttons/borders follow theme selection automatically
- **Improved (Glass refinement)**:
  - **Glass shadow upgrade**: 4-layer composite shadow — top hairline highlight (inset 1px white), micro outer stroke (1px slate-900 @ 4%), far ambient (0 8px 32px @ 12%), near contact (0 2px 6px @ 5%) — gives cards real "frosted acrylic" presence on light backgrounds where pure translucency was invisible
  - **Page surface ambient**: `main` container now has `.page-surface` (dual blue/violet radial blobs @ 18% / 14% opacity, 60px blur) so glass cards have actual color to refract through — previously cards looked solid white on solid white background
  - **AccountCard refactor**: removed stray `border` + `hover:shadow-lg` overrides that were stomping the glass system; now uses `hover-lift` utility (translateY -2px + enhanced shadow) on non-active/non-banned cards; active glow border and banned red border preserved
  - **AccountToolbar inputs**: search box and view-mode toggle now use `bg-[var(--glass-bg-subtle)] backdrop-blur-md` with rounded-xl + larger focus ring; filter panel number inputs (`AccountFilter`) same treatment
- **New**: Accounts page now supports **List view** in addition to the existing card grid — toolbar gains a Grid/List toggle, persists to `localStorage('accounts_viewMode')`. Compact list rows show inline email + status + subscription + tags + credit progress + key actions, with ~5x density vs cards (good for managing 100+ accounts)
- **Fixed**: System Logs page `displayLimit` default changed from `All` to `5K` and now persists to `localStorage('systemLogs_displayLimit')` — previously the value reset to `All` on every page navigation/app restart, hurting initial render performance with large log volumes

#### Token-Based History Trimming
- **New**: `tokenBufferReserve` setting (replaces previous `maxInputTokensThreshold`) — adaptive history trimming based on the actual model's `contextWindow` returned by `ListAvailableModels`
- **Changed**: Effective trim threshold computed as `model.maxInputTokens - tokenBufferReserve` per request — default `50000` reserve fits all models (200K models → 150K cutoff, 1M models → 950K cutoff)
- **New**: Reserve accounts for `system` + `tools` + current message + output budget + estimation skew, preventing `CONTENT_LENGTH_EXCEEDS_THRESHOLD` on long conversations regardless of byte-based payload size
- **New**: Model context cache synced from `fetchKiroModels` into the trimming logic so newly added Kiro models pick up correct limits automatically

#### Dialog Glassmorphism Refactor
- **Refactored**: 17 dialogs unified under `.glass-card-strong` — rewritten as 90% translucent white (`rgba(255,255,255,0.90)` / dark `rgba(20,25,40,0.90)`) + `backdrop-filter: blur(20px) saturate(160%)` real frosted glass + 3-layer composite deep shadow (1px outer border + 0 24px 64px far shadow + 0 8px 24px near contact shadow) for strong elevation
- **Unified**: dialog overlays standardized from `bg-black/40 backdrop-blur-sm` / `bg-black/50` to `bg-slate-900/[0.12] dark:bg-black/50 backdrop-blur-xl` — light-mode 12% slate ultra-faint mask + heavy blur (24px) so background blurs without graying out the dialog sample
- **Unified**: all dialog close buttons (×) now use red hover — `hover:bg-red-500 hover:text-white transition-colors`, covering `AccountDetailDialog` / `EditAccountDialog` / `AddAccountDialog` / `TagManageDialog` / `GroupManageDialog` / `ExportDialog` / `AccountCard` ban+subscription / `ApiKeyUsageDialog` / `AccountSelectDialog` / `UpdateDialog` (15+ dialogs total), matching TitleBar close button for consistent danger semantics
- **Improved**: `--glass-bg-strong` token changed from opaque white to 90% translucent + `backdrop-filter` now actually applies, so dialogs are no longer flat opaque cards but true glass panels

#### Theme Base Color & Ambient Light Overhaul
- **Design**: Light-mode background `#f4f7fb` → `#EEF2F8` icy blue (inspired by F1 Fresh Blue), reducing the dead-white "AI palette" feel
- **Design**: Dark-mode background `#0a0e1a` → `#0B1220` deep navy (inspired by E1 Deep Space), shifted from neutral gray-black to blue tone
- **New**: 3-stop body gradient — light mode `#E5EBF5` → `#EEF2F8` → `#F2F5FA` simulating daylight transition; dark mode `#0F1729` → `#0B1220` → `#060A14` for night-sky depth
- **New**: body gradient top/bottom tinted via `color-mix(in srgb, var(--gradient-from) 10%, ...)` — **switching themes now changes the entire ambient background** (previously themes only affected buttons, not background atmosphere)
- **Improved**: Ambient blobs changed from hardcoded `rgba(91,140,255,0.55)` blue/purple to `color-mix(var(--gradient-from) 38%, transparent)` — breathing glow follows the active theme hue, so blue/purple/green/orange/gold themes each have a distinct atmospheric tone
- **Improved**: Titlebar light-mode glass updated from `rgba(255,255,255,0.75)→rgba(244,247,251,0.65)` to `rgba(255,255,255,0.78)→rgba(229,235,245,0.65)`; dark-mode from neutral dark-gray to deep navy `rgba(22,30,48,0.85)→rgba(11,18,32,0.75)`
- **Fixed**: App root `<div>` had `bg-background` opaque class overriding the body gradient — now removed so the gradient is actually visible

#### Theme Expansion — 11 Premium Themes Added (32 Total)
- **New**: "Luxury" group (4) — `gold` `#C9A227` / `navy` `#1E40AF` / `wine` `#9F1239` / `champagne` `#B89968`, suited for finance, business, and luxury-brand contexts
- **New**: "Morandi" group (4) — `dustyblue` `#64748B` / `terracotta` `#B45434` / `sage` `#6B8E5A` / `mauve` `#8E7CC3`, low-saturation premium grays for long-session eye comfort
- **New**: "Natural" group (3) — `coral` `#F87171` / `forest` `#166534` / `ocean` `#155E75`, calm natural tones
- **Improved**: Each new theme has matched dark-mode values (e.g., `forest` light `#166534` / dark `#4ADE80`) for WCAG contrast
- **Synced**: `accounts.ts` theme-removal list includes the 11 new classes; `zh.ts` / `en.ts` / `AboutPage.tsx` updated from "21 themes" to "32 themes"

#### Usage Stats Progress Bar Enhancement
- **New**: Live percentage pill at progress bar top-right — color-graded by usage: < 50% green, 50-80% yellow, 80-100% orange, > 100% red
- **New**: Over-quota dual-segment progress bar — base segment (0-100% filled, color-graded) + red striped overflow overlay on the right (`animate-pulse` + 45° `repeating-linear-gradient`), overflow visual width proportional to excess ratio (capped at 60% so base color remains visible)
- **New**: Red warning banner appears below progress bar when over quota — shows "⚠️ Over Quota +X.XX%" + "Excess: Y credits" inside `bg-red-500/10` + `border-red-500/30` highlight area
- **Improved**: Both percentage and over-quota ratio respect the `usagePrecision` setting (2 decimals when enabled, 1 when off)

### v1.6.6 (2026-5-17)

#### E2E Test Suite
- **New**: Full E2E compatibility test suite under `test/e2e-fullsuite/` (**30 cases, 29/30 pass**) — covers Claude Code / OpenCode real captured requests + boundary/error paths
- **New**: Base protocol coverage (CASE 01-16): probe, streaming, system array, tools (snake/Pascal/MCP-schema), multi-turn tool_result+text regression, thinking signature, Claude Code Skill replay, 12KB tool description, OpenAI streaming/tool-call, opencode reasoning/multi-turn/promptCacheKey
- **New**: Error path coverage (CASE 17-21): missing/wrong token (401), invalid JSON (400), unknown model fallback, client-side abort cleanup
- **New**: Special endpoints (CASE 22-24): `/v1/messages/count_tokens`, `/v1/models`, `/v1/responses` (OpenAI Responses API)
- **New**: Multimodal/fields (CASE 25-28): image base64, `tool_choice=any/none`, `stop_sequences`
- **New**: Admin/routing (CASE 29-30): admin/stats request count tracking, admin/config apiKeys readable
- **New**: Zero-dependency runner (`node test/e2e-fullsuite/run.mjs`), supports `--only <id|tag>` filter, JSON report (`last-report.json`)
- **New**: `npm run test:e2e` and `npm run test:e2e:only` scripts; full docs at `docs/E2E-TESTING.md`
- **Note**: Default model `claude-sonnet-4.5` (overridable to `claude-opus-4.7` etc); CASE 01 probe assertion relaxed (Kiro proxy has no probe-intercept)

#### Log Optimization
- **Improved**: All API logs (CBOR/REST) now show account email for easy identification
- **Improved**: API response logs split into one-line summary + expandable JSON data (click ⓘ to view)
- **Improved**: Removed token plaintext from logs (security), replaced with `token=Nchars` length indicator
- **Improved**: Redundant multi-line logs consolidated — `[IPC]`, `[Kiro API]`, `[Kiro REST API]` each reduced to 1 line per request/response
- **Improved**: `[KiroPayload]` and `[KiroAPI] Request to` keep structured data in expandable details
- **Removed**: `[REST->Unified] Converting response` duplicate log, `Using K-Proxy agent` noise logs

#### Account Pool Strategy
- **New**: Account selection strategy configurable — `round-robin` (default, load balanced) or `sticky` (preserves prompt cache); UI toggle next to Multi-Account switch
- **Fixed**: 🔥 Multi-account "rotation" actually didn't rotate — `recordSuccess` always pinned `currentIndex` to the success account, so successful requests stuck on the same account until failure. Default behavior changed to true round-robin (`currentIndex = (success + 1) % len`). Existing sticky behavior preserved as opt-in for prompt-cache-sensitive workloads.

#### UI Enhancements
- **New**: Models dialog now shows a dismissible IP-restriction tip — Pro/Pro Max subscriber but missing advanced models? Likely China-mainland IP restriction; suggest VPN/proxy or switching to US/EU residential IP. Persisted via `localStorage('models_dialog_ip_tip_dismissed')`.
- **Improved**: Proxy Detailed Logs dialog — replaced pagination with virtual scrolling + smart auto-follow + "Back to bottom" floating button
- **Improved**: System Logs page — added time range filter (1h/6h/1d/7d), category dropdown, display limit selector (5K–100K)
- **Improved**: System Logs fetch count now follows user-selected display limit instead of hardcoded 3000
- **Improved**: Both log pages share consistent UX: scroll-up pauses follow, bottom indicator, new log count badge

#### Advanced Configuration
- **New**: Payload size limit configurable in Advanced Settings (256KB–10240KB, default 1536KB/1.5MB)
- **Changed**: Payload truncation threshold raised from 380KB to 1.5MB — supports 200K+ token context models without premature truncation
- **Changed**: Tool result truncation length increased from 2000 to 4000 chars when limit is reached

#### Bug Fixes
- **Fixed**: 🔥 **Multi-turn thinking / Claude Code Skill 502** — `history.assistantResponseMessage.reasoningContent` was rejected by Kiro backend with `400 Improperly formed request`. Now history drops thinking blocks (current-turn thinking still works via `additionalModelRequestFields.thinking={type:'adaptive'}`). Affects both Anthropic and OpenAI converter paths. Caught by E2E CASE-08/09.
- **Fixed**: Cache token double-counting — `input_tokens` now subtracts `cache_read` + `cache_creation` to match Anthropic spec (was inflating client billing display)
- **Fixed**: Unknown model fallback — `mapModelId` now falls back to `MODEL_ID_MAP.default` (claude-sonnet-4.5) when model is completely unrecognized; preserves forward-compat for `claude-{sonnet|haiku|opus}-{ver}` patterns. Previously typo'd model names returned upstream `400 Improperly formed request`. Caught by E2E CASE-20.
- **Fixed**: Non-streaming paths missing `credits` / `responseTime` / `cacheReadTokens` / `reasoningTokens` in stats — affected `/v1/responses` (both stream and non-stream), `/v1/chat/completions` non-stream, `/v1/messages` non-stream. Frontend log table showed `-` for Credits and Time columns on non-streaming requests. All 4 paths now emit the full event payload + persist to `recordRequest`.

### v1.6.5 (2026-5-15)

#### Prompt Cache Simulator
- **New**: Full prompt cache simulation — tracks `cache_control` breakpoints, calculates `cache_read_input_tokens` and `cache_creation_input_tokens` per account, returns realistic cache usage in API responses
- **New**: Cache hit rate displayed in proxy dashboard with percentage badge
- **New**: Three-tier detection: tools → system → message blocks, supports `ephemeral` TTL (5min/1h)

#### Frontend Dashboard Enhancement
- **New**: Second row of stats cards — Total Tokens, Input/Output, Cache Hit %, Reasoning Tokens, Success Rate, Credits
- **New**: Large numbers auto-compact (e.g. `206.3M`, `1096K`) with hover tooltip for full value
- **New**: Log table columns added — Cache Read (green), Response Time
- **New**: System Logs page in sidebar — full console output with virtual scrolling, level filter, search, auto-follow

#### System Logs Page
- **New**: Dedicated logs page showing ALL system output (proxy, API, accounts, background tasks)
- **New**: Console interceptor captures `console.log/warn/error` into log store
- **New**: Virtual scrolling (`@tanstack/react-virtual`) — handles 100K+ entries without lag
- **New**: Smart auto-scroll — follows at bottom, pauses on scroll up, floating "Back to bottom" button with new log count
- **New**: Level filter pills (ALL/DEBUG/INFO/WARN/ERROR) with colored counts
- **New**: Grid-aligned columns, category color coding (Kiro=blue, ProxyServer=violet, KiroAPI=cyan)
- **New**: Click to expand data details (JSON formatted), stream events aggregated into summary

#### Bug Fixes
- **Fixed**: `tool_result content block N requires text` — empty/null tool results now normalized to `"(no output)"` instead of throwing 400
- **Fixed**: Thinking parameter sent to non-Claude models causing 400 — now only sent to Claude 4+ models via `modelSupportsThinkingParam()`
- **Fixed**: Stream event logs flooding — aggregated into single summary per request when `logStreamEvents` enabled
- **New**: Hidden model IDs added to model list — `simple-task`, `CLAUDE_SONNET_4_20250514_V1_0`, `CLAUDE_HAIKU_4_5_20251001_V1_0`, `CLAUDE_3_7_SONNET_20250219_V1_0`

### v1.6.4 (2026-5-14)

#### API Proxy
- **Fixed**: Claude Code `thinking` parameter no longer causes `400 REQUEST_BODY_INVALID` — all thinking requests mapped to Kiro enum `{ type: "adaptive" }` (Kiro schema only accepts `["adaptive", "disabled"]`)
- **Fixed**: `context_management`, `effort`, `anthropic_beta` no longer injected into `additionalModelRequestFields` — Kiro schema does not allow additional properties, only `thinking` is permitted
- **Fixed**: System prompt no longer embedded as `--- SYSTEM PROMPT ---` text in user messages (detected as prompt injection by Claude models) — now uses Kiro official Human/AI pair injection matching the official IDE behavior
- **Fixed**: CodeWhisperer model ID resolution no longer incorrectly maps `claude-opus-4.7` to a Sonnet model — matching uses model family exclusion (opus/sonnet/haiku) to prevent cross-family mismatches
- **Fixed**: Model matching no longer searches description text, reducing false positives for new models not yet in `ListAvailableModels`
- **Fixed**: Token estimation corrected — input (JSON payload) uses 0.3 token/char, output (natural language) uses 0.4 token/char with CJK-aware `estimateTokens()` helper
- **Changed**: AmazonQ CLI endpoint origin updated to `SM_AI_STUDIO_IDE`

#### Session Stability & Anti-Ban
- **New**: `conversationId` stabilization — same client session reuses the same `conversationId` across multi-turn requests (matches official Kiro IDE behavior)
- **New**: Three-tier session detection: HTTP headers (`X-Claude-Code-Session-Id`, `x-opencode-session`, `x-session-affinity`) → body fields (`conversation_id`, `thread_id`, `session_id`) → history fingerprint fallback
- **New**: API Key isolation — different API keys automatically get separate conversation namespaces
- **New**: `/admin/cache/clear` endpoint — manually clear conversationId and model cache

#### Claude Code Compatibility
- **New**: `redacted_thinking` block support — Kiro's `ReasoningContentEvent.redactedContent` decoded and converted to Anthropic `redacted_thinking` content blocks (request input and response output)
- **New**: Payload size limiter — when payload exceeds 380KB, oldest large tool results are truncated to 2000 chars with marker; prevents Kiro API rejection on long conversations
- **New**: OpenAI-compatible `thinking` parameter also mapped to Kiro `additionalModelRequestFields`

### v1.6.2 (2026-5-13)

#### Account Switching
- **Fixed**: Switching to Google/GitHub social login accounts no longer causes `Invalid token` error in Kiro IDE
- **Fixed**: Token is now refreshed before writing to `kiro-auth-token.json`, ensuring Kiro IDE always gets a valid `accessToken`
- **Fixed**: `profileArn` is now always included in the token file, auto-derived from provider when not stored (Google/GitHub → social profile, BuilderId → builder profile)
- **Fixed**: Social login token file format now exactly matches official Kiro IDE output (no extra `region` or `clientIdHash` fields)
- **Fixed**: Kiro CLI switch also refreshes token before writing, includes `profileArn`, and correctly identifies social vs IdC login
- **Fixed**: CLI `isSocial` detection no longer incorrectly classifies BuilderId as social login

#### Client Configuration
- **Fixed**: One-click client configuration now loads models from proxy service first (consistent with "View Models" dialog), falls back to direct account query only when proxy is not running
- **Fixed**: Claude Code configuration now writes `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, and `ANTHROPIC_DEFAULT_SONNET_MODEL` fields, matching the full official config format
- **Fixed**: Hidden models (e.g., `claude-3.7-sonnet`) now appear in one-click client configuration model list

#### Proxy & Network
- **New**: System proxy auto-detection — Windows (registry `Internet Settings`) and macOS (`scutil --proxy`) with 30s cache
- **Fixed**: All outbound connections now follow unified proxy priority: user-configured proxy → system proxy → direct
- **Fixed**: Registration module (MoEmail, TempMail.Plus, Outlook OAuth, TLS client) no longer uses a separate proxy input; follows global proxy settings automatically
- **Fixed**: Image download in proxy server also falls back to system proxy

#### Registration
- **New**: Auto-fetch Kiro Pro subscription link after registration — toggle in registration page, results displayed in Subscription page "Links" tab
- **Improved**: Concurrent registration log isolation — each batch task prefixed with `[#taskId]` to prevent log mixing
- **Improved**: Registration log events now carry structured `{ message, taskId }` for better filtering
- **Fixed**: `refreshAppJSConfig` uses Promise lock to prevent concurrent workers from racing on app.js download
- **Removed**: Per-registration proxy input field (now uses global proxy settings)

### v1.6.1 (2026-5-12)

#### API Proxy Compatibility
- **Fixed**: OpenCode compaction requests with historical tool calls no longer fail with Kiro API `400 Improperly formed request`
- **Fixed**: Added official Kiro-style conversation sanitization for native history mode, including tool result relocation, orphan tool result removal, missing tool result completion, message alternation, and final validation
- **Fixed**: Historical tool calls/results are converted to plain text when the current request does not include matching tool definitions, preserving compaction context while avoiding Kiro backend tool schema validation errors
- **Fixed**: AmazonQ CLI endpoint now uses the correct `CLI` origin for `/SendMessageStreaming`, and the ineffective automatic fallback from `amazonq-cli` to IDE protocol endpoints was removed
- **Improved**: Kiro request diagnostics now include current tool results, history message count, and historical tool use/result counts for easier payload troubleshooting

#### Client Configuration
- **Fixed**: One-click client configuration no longer shows "No models loaded" after a fresh install and adding the first account when the direct account model query returns an empty list
- **Fixed**: Account model loading now passes full account identity fields (`machineId`, `provider`, `authMethod`, `accountId`) to `ListAvailableModels`
- **Fixed**: One-click client configuration falls back to proxy model loading when account-level model loading succeeds with an empty model list
- **Fixed**: Account detail model list uses the same complete account identity fields, improving model loading consistency for newly added accounts

#### Account Refresh & Status
- **Fixed**: Network errors such as `fetch failed`, token expiration, refresh failures, and `UnauthorizedException` are no longer counted as banned accounts
- **Fixed**: Auto refresh only skips accounts with explicit suspension signals (`AccountSuspendedException`, `AccountSuspended`, or HTTP `423`), so transient network/token errors can still be retried in later refresh cycles
- **Fixed**: Account cards, account selection dialog, banned-account filter, and banned statistics now share stricter suspension detection logic
- **Fixed**: Plain HTTP `403` is no longer treated as a ban signal during account status checks

### v1.6.0 (2026-5-12)

#### API Proxy Enhancement
- **New**: Gemini v1beta API compatibility (`/v1beta/models`, `/v1beta/models/{model}:generateContent`, `/v1beta/models/{model}:streamGenerateContent`)
- **New**: One-click client configuration supports 6 clients: Claude Code, OpenCode, Codex CLI, Gemini CLI, Hermes, OpenClaw
- **New**: AmazonQ CLI endpoint isolation — `amazonq-cli` preferred endpoint uses SendMessageStreaming only, no fallback on failure
- **New**: Smart account rotation — circuit breaker + sticky behavior + exponential backoff + probabilistic retry (inspired by Kiro Gateway architecture)
- **New**: Error classification system — `FATAL` (request problem, return directly) vs `RECOVERABLE` (account problem, switch to next)
- **New**: Proactive quota filtering — exhausted accounts excluded before selection, no more waiting for 429
- **New**: `onPoolEmpty` lazy-load callback — proxy auto-loads accounts from store on first request (fixes Mac cold-start 503)
- **New**: Cold-start account pool synchronous retry mechanism (5 retries, 2s/4s/6s/8s/10s intervals)
- **New**: Model capability tags — model list displays Thinking/Caching/Effort capabilities (parsed from ListAvailableModels)
- **New**: Hidden model support — Claude 3.7 Sonnet and other models not in official list but supported by backend
- **Improved**: Request headers/UA/version fully match official Kiro IDE 0.12.155 capture (SDK 1.0.34, dynamic OS/Node fingerprint)
- **Improved**: Request body adds agentContinuationId/agentTaskType fields, matching official protocol
- **Improved**: All outbound requests routed through app-level HTTP proxy (including token refresh, SSO login, image download, etc.)
- **Improved**: machineId empty value fallback (SHA-256 hash), token refresh random jitter (0-3s), IDC UA dynamic OS
- **Improved**: K-Proxy MITM adds body machineId replacement + telemetry domain kiro.dev interception
- **Improved**: Tool call token estimation covers all exits (tool name + parameter JSON)
- **Improved**: 503 error message includes quota details (`All accounts quota exhausted (X/Y exhausted, Z in cooldown)`)
- **Improved**: Extended quota error detection patterns (402, 429, ThrottlingException, ServiceQuotaExceededException, rate limit, limit exceeded)
- **New**: Streaming log toggle — off by default, shows detailed JSON for each streaming event when enabled (assistantResponseEvent/toolUseEvent, etc.)
- **Improved**: Thinking mode simplified — removed legacy `<thinking>` tag detection, directly pass through native reasoningContentEvent as OpenAI `reasoning_content` / Claude thinking block
- **New**: `additionalModelRequestFields` support — passes through `thinking` parameter from client to Kiro API

#### Account Switching
- **New**: Kiro CLI switch support — writes credentials to `~/.local/share/kiro-cli/data.sqlite3` SQLite database
- **New**: Settings allows selecting switch target: "Kiro IDE" / "Kiro CLI" / "Both (IDE + CLI)" (default: IDE)
- **New**: Manual and auto switching both follow `switchTarget` setting
- **New**: CLI switch uses Read-Merge-Write strategy, preserves unknown fields, cleans expired priority keys

#### Subscription & Overage
- **New**: Batch overage settings page — "One-click Enable" (only disabled) and "Set All" (all subscribed) buttons
- **New**: Account overage status overview table (subscription type, overage capability, overage status)
- **Fixed**: `overageStatus` field detection — correctly maps REST API `"ENABLED"`/`"DISABLED"` strings to boolean values
- **Fixed**: Batch check and batch refresh now return `resourceDetail` and `overageCapability` to frontend

#### UI & Interaction
- **New**: Registration page full redesign — using Card/Button/Input/Label/Progress/Badge/Switch component library
- **New**: Subscription page header redesign — gradient banner style
- **New**: Both pages support theme color switching and dark mode
- **Fixed**: Batch registration progress/history no longer lost after page navigation (module-level React setter refs)
- **Fixed**: Windows dev terminal Chinese encoding issue (prepend `chcp 65001` to dev script)

#### Account Registration
- **New**: Account registration feature (Manual / MoEmail / Outlook / Custom Domain modes)
- **New**: Custom domain mode — user provides domain (configure catch-all forwarding to TempMail.Plus), system auto-generates random English name email prefix for registration
- **New**: Concurrent batch registration — configurable concurrency (1-10 tasks simultaneously)
- **New**: Batch registration with auto-import, failure retry, per-item status tracking
- **New**: Manual mode step progress indicator
- **New**: All modes auto-verify and import account after successful registration
- **New**: Session-level registration state persistence (logs, stages, history preserved after page navigation)
- **New**: Manual mode supports mid-process cancellation
- **New**: Registration page full i18n support (Chinese/English)

#### Bug Fixes
- **Fixed**: Model alias mapping changed to exact match, `claude-opus-4.7` and other dynamic models no longer downgraded
- **Fixed**: Proxy test page loads real `/v1/models` results, avoids selecting unavailable static aliases
- **Fixed**: Unknown model IDs passed through as-is, no longer remapped to static Claude defaults
- **Fixed**: Proxy default endpoint order changed to AmazonQ first, CodeWhisperer fallback
- **Fixed**: Proxy streaming requests routed through app-level HTTP proxy
- **Fixed**: CodeWhisperer requests resolve short aliases to `ListAvailableModels` official IDs
- **Fixed**: CodeWhisperer requests include `x-amzn-kiro-agent-mode` header
- **Fixed**: Registration page blank screen issue (TDZ error)
- **Fixed**: Manual mode registration accounts no longer imported twice
- **Fixed**: TLS fingerprint upgraded to `chrome_144`
- **Fixed**: Corrected `tlsclientwrapper` API call — body as 2nd parameter, options as 3rd parameter

### v1.5.0 (2025-02-06)
- 🌐 **API Regional Routing Fix**: Fixed 403 errors for EU accounts when calling ListAvailableModels/fetchSubscriptionToken/fetchAvailableSubscriptions, all API calls now route to correct regional endpoints (eu-* → eu-central-1, others → us-east-1)
- 🔄 **Regional Fallback Mechanism**: Auto-retry with alternate regional endpoint on 403 errors, ensuring all regions (ap-*, ca-*, sa-*, me-*, af-*) work correctly
- 🔄 **Stale Status Fix**: Fixed GetUserInfo "Stale" status being incorrectly treated as an error, Stale is now treated as a normal active state
- 📋 **Model List Enhancement**: fetchKiroModels now passes profileArn parameter and supports pagination, consistent with official plugin, returns complete model list
- ⚙️ **Kiro Settings Page Update**: Model Selection changed to dropdown with dynamic model fetching from current account (fallback to text input); added Trusted Tools config; descriptions aligned with official IDE
- ⚙️ **Settings Model Fetch Optimization**: Settings page model list now uses the current active account (isActive) instead of the first account in store
- 🔧 **Proxy Model Fetch Fix**: getAvailableModels now uses getAvailableAccount() instead of getNextAccount(), respecting multi-account toggle and selected account settings
- 🔄 **CBOR → REST Auto Fallback**: Enterprise/IdC accounts automatically fall back from CBOR API to REST API on failure (consistent with official IDE behavior)
- 💾 **Disk Write Optimization**: Added debouncedStoreSet mechanism to batch multiple store.set() calls into one write every 5 seconds; tray menu updates debounced to 3 seconds; flushStoreWrites() on exit to prevent data loss
- 🔧 **PowerShell Multi-Path Detection**: Optimized admin privilege check and elevated restart with auto-detection of multiple PowerShell paths (PS7/System32/SysWOW64/PATH), compatible with more Windows environments
- 🐧 **Linux deb Package Fix**: Added afterInstall script to auto-fix chrome-sandbox SUID permissions and install path space issue, resolving sandbox/execvp launch failures

### v1.4.9 (2025-02-02)
- 🗺️ **AWS Region Expansion**: OIDC and online login AWS Regions expanded from 3 to 21, grouped by US/Europe/Asia Pacific/Other
- 🗺️ **AWS Region Custom Input**: Added custom input field for manual entry of unlisted regions (e.g., cn-north-1)
- 🔀 **Model Mapping Feature**: New model mapping management with replace, alias, and load balance modes
- 🎯 **Model Mapping Rules**: Support wildcard * matching, weight configuration, and per-API-Key rule settings
- � **Official Model List**: Model mapping auto-fetches Kiro official models for easy target selection
- 📝 **Model Mapping UI**: Added source/target model field descriptions for clarity
- �💻 **Win11 Machine ID Optimization**: Triple fallback for machine ID retrieval (reg query → PowerShell → WMIC)
- 🔐 **Admin Privilege Detection**: Enhanced detection (PowerShell WindowsPrincipal → net session)
- 🌙 **Dark Mode Fix**: Fixed machine ID page display area background color in dark mode

### v1.4.8 (2025-01-29)
- 📊 **Request Logs Model Column**: Added model column to request logs table and recent requests preview
- 🧠 **Thinking Tag Conversion**: Detect &lt;thinking&gt; tags in regular responses and convert based on config
- 📜 **Detailed Logs Sorting**: Fixed detailed logs sorting, newest logs now appear first
- 📈 **API Key Usage Details**: New usage details dialog with history, model stats, and daily charts
- 🗂️ **API Key Manager Optimization**: Dialog width increased from 600px to 800px for better display
- 🧠 **Thinking Output Format**: Added dropdown to select reasoning_content / &lt;thinking&gt; / &lt;think&gt; formats

### v1.4.7 (2025-01-29)
- 📊 **Request Logs Token Detail**: Added Input/Output tokens columns to request logs table
- 📊 **Recent Requests Enhancement**: Recent requests preview also shows Input/Output tokens
- 📐 **Logs Dialog Width**: Increased request logs dialog width from 700px to 900px
- 🎯 **Toolbar Layout Optimization**: Account management toolbar buttons right-aligned with reduced spacing
- 💰 **Trial/Bonus Quota Display**: Fixed REST API freeTrialInfo and bonuses display with unified timestamp format
- 🔧 **Machine ID Page Fix**: Fixed copy/refresh buttons not responding to clicks
- ✅ **Copy Feedback**: Machine ID page copy button now shows "Copied!" feedback
- 🔄 **Refresh Animation**: Machine ID refresh button now shows spinning animation

### v1.4.6 (2025-01-28)
- 🔑 **Multi API Key Management**: Support creating multiple API Keys with selectable formats (sk-xxx / PROXY_KEY / KEY:TOKEN)
- 💰 **Credits Limit**: Set independent Credits usage limit for each API Key
- 📊 **API Key Usage Stats**: Track requests, Credits, and Tokens usage for each API Key
- 🚫 **Auto-Reject on Quota Exceeded**: Returns 429 error when Credits limit exceeded
- 🧠 **Model Thinking Mode**: Configure Extended Thinking mode default setting for each model
- ⏰ **Precise Timestamps**: API Key creation time and last used time shown with seconds
- 🔧 **K-Proxy Integration**: Added K-Proxy service support for device fingerprint management and request proxying
- 🆔 **Device ID Management**: Support account-bound device IDs with import/export for device ID mappings
- 🔄 **API Type Switch**: Support both REST API (GetUsageLimits) and CBOR API (GetUsage) modes
- 🌐 **Proxy Request Support**: Kiro API requests can be sent through K-Proxy using undici library
- 📊 **Usage Query Enhancement**: Unified usage query interface with automatic API type adaptation
- ⌨️ **Global Shortcut**: Added show window shortcut with customizable key binding and key recording
- 🍎 **macOS Shutdown Fix**: Fixed app blocking shutdown, added 3s timeout for force quit
- 🍎 **macOS Dock Optimization**: Click Dock icon to show main window directly (like WeChat)

### v1.4.5 (2025-01-21)
- 🐛 **Enterprise Account Dedup Fix**: Fixed enterprise accounts (no email) being incorrectly flagged as duplicates, now uses userId for checking
- 🎨 **Subscription Badge Color**: Detail page subscription badge color now matches card (PRO+ purple, POWER gold, PRO blue)
- 🔧 **Enterprise Identity Fix**: Fixed Enterprise account provider changing to Internal after refresh
- ⚡ **Log Performance**: Use useMemo to cache filtered logs, optimize search logic, fix lag with large log volumes
- 📐 **Detail Page Layout**: Fixed long account name/nickname causing layout wrap, auto-truncate long text
- 📋 **Quick Copy Email**: Click account card email to copy to clipboard with "Copied!" feedback
- 🔍 **Filter Enhancement**: Added Enterprise to IDP filter, added banned account filter
- 🎨 **Filter Colors**: Subscription filter buttons now have colored styling (FREE gray, PRO blue, PRO+ purple, POWER gold)
- 🐛 **Subscription Parse Fix**: Fixed PRO+/POWER subscription types not being correctly identified

### v1.4.4 (2025-01-21)
- 📊 **Session Statistics**: Added request statistics for current service session, resets on service restart
- 🎯 **Tray Menu Enhanced**: Tray menu shows total/session stats, subscription type, used/total credits, and supports language switching
- 🔄 **Auto-Switch on Quota Exhausted**: In single-account mode, auto-switch to next available account when 402 quota error detected
- 📐 **Proxy Panel Layout**: Stats cards changed to compact 6-column single-row layout
- 🔄 **Status Indicator**: Running status badge now has animated ping effect
- 🎨 **Page Width Unified**: API proxy page width now matches other pages
- 🌐 **UI Translation**: Added English translation for close confirm dialog and detailed logs interface
- 📄 **Log Pagination**: Detailed logs support pagination with page jump feature to prevent lag
- 🔍 **Request Details**: Log entries can be expanded to view request details (model, content length, tools count, history length, etc.)
- ⏰ **Full Timestamp Format**: Log timestamps now show full format YYYY-MM-DD HH:mm:ss.ms
- 📋 **Log Filtering**: Added time range filter (1h/6h/12h/1d/3d/7d/30d/180d/1y) and display limit (5000-1M entries)
- 💾 **Settings Persistence**: Time range, display limit, and page size settings auto-saved
- 📦 **Log Storage Expansion**: Backend log storage limit increased from 10K to 1M entries
- 🐛 **Progress Bar Fix**: Fixed account selection dialog progress bar not showing full when quota exhausted

### v1.4.3 (2025-01-20)
- 📋 **Detailed Logs Viewer**: New detailed logs page for proxy server, similar to console output, supports real-time event viewing
- 💾 **Log Persistence**: All proxy logs are persistently saved to `proxy-logs.json` until manually cleared
- 🎨 **Logs UI Enhancement**: Beautiful logs interface with search, filter by level/category, auto-scroll, export and clear functions
- 🎯 **Theme Adaptive**: Logs interface and dropdown colors follow user selected theme
- 🔧 **Custom Dropdown**: Replaced native select with styled custom dropdown component with icons and selected state
- 🧠 **Execution-Oriented Directive**: Auto-inject execution-oriented directive into system prompt to prevent AI goal drifting
- 📊 **Extended Token Info**: Added Cache Tokens (read/write) and Reasoning Tokens statistics
- 📈 **Complete Usage Response**: OpenAI/Claude streaming responses now return complete usage information
- 🔗 **API Endpoints Layout**: API endpoints list now uses 3-column layout (method/path/description), POST in orange, GET in green
- 🔄 **Unified Log Routing**: Logs from kiroApi and proxyServer are now routed through proxyLogger to UI
- 🐛 **Log Storage Fix**: Fixed request logs and detailed logs using same file path causing data loss
- 🐛 **Invalid Date Fix**: Fixed "Invalid Date.NaN" issue when loading old logs

### v1.4.2 (2025-01-20)
- 🔄 **Native History Support**: Refactored based on Kiro official implementation, using native history field instead of text embedding
- 🧹 **Message Sanitization**: Implemented sanitizeConversation to ensure message alternation, tool call matching, etc.
- 🔧 **API Compatibility Fix**: Fixed 400 errors caused by incorrect message format

### v1.4.1 (2025-01-19)
- 💰 **Credits Display**: Replaced Tokens with Credits usage display
- 📊 **Total Credits Stats**: Added cumulative Credits statistics with persistence
- 🔄 **Reset Credits**: Added button to reset total Credits count
- 🔍 **Error Details Popup**: Click error badge in request logs to view error details
- 🔁 **Auto Continue Rounds**: Auto-send "Continue" after tool calls to prevent stream interruption
- 🚫 **Disable Tool Calls**: New toggle to remove tools parameter, AI responds directly without tools

### v1.4.0 (2025-01-19)
- 🔧 **API 400 Error Fix**: Fixed Kiro API not supporting toolResults and history fields, now embedded as text
- 🔄 **Multi-Account Toggle Fix**: Fixed issue where accounts still switched when multi-account polling was disabled
- 👤 **Specify Account Feature**: Can now specify which account to use when multi-account polling is disabled
- 🎯 **Account Select Dialog**: New account selection dialog showing email, subscription type, usage progress bar, and status
- 🔍 **Account Search**: Account selection dialog supports searching by email, ID, or subscription type
- 🚫 **Banned Status Display**: Account selection dialog correctly shows banned/error/expired status
- 💾 **Proxy Config Persistence Fix**: Fixed port, host, API Key, preferred endpoint, max retries not persisting after restart
- 🎨 **Subscription Color Consistency**: Account selection dialog subscription colors now match account cards

### v1.3.9 (2025-01-19)
- 🔐 **Enterprise Login Fix**: Fixed IAM Identity Center SSO login using Authorization Code Grant with PKCE flow
- 🔧 **Enterprise Switch Fix**: Fixed account switching for Enterprise accounts by using correct startUrl to calculate clientIdHash
- 🚪 **Logout Button**: Active account now shows logout button instead of switch button, clears SSO cache on click
- 🌙 **Dark Mode Button Fix**: Login method buttons now properly support dark mode with theme-aware background colors
- 👤 **Account Display Optimization**: Accounts without email now display nickname or userId as fallback
- 🏷️ **Enterprise Label Update**: Changed "组织身份" to "Enterprise" in login UI for consistency

### v1.3.8 (2025-01-18)
- 🏢 **IAM Identity Center SSO Login**: Added organization identity login support via IAM Identity Center SSO
- 🔗 **SSO Start URL Input**: Users can input their organization's SSO Start URL for authentication
- 🌍 **AWS Region Selection**: Support 20+ AWS regions for SSO login (US, Europe, Asia Pacific, etc.)
- 🏷️ **Enterprise Provider Support**: OIDC credential import now supports `Enterprise` provider type
- 📦 **Batch Import Enhancement**: Batch import JSON example now includes Enterprise provider
- 🔄 **One-Click Switch Compatibility**: Account switching fully supports Enterprise/IAM_SSO provider types
- 📊 **Statistics Enhancement**: Account statistics now track Enterprise and IAM_SSO identity types
- 📌 **Tray Icon Enhancement**: Tray menu icons now use external PNG files, support custom replacement
- 🔄 **Tray Status Sync**: Tray status updates in real-time when starting/stopping proxy from UI
- 📝 **Close Confirm Dialog**: Custom close confirmation dialog with "Remember my choice" option

### v1.3.7 (2025-01-17)
- 📊 **Account Available Models**: Added available models list in account detail page
- ⚡ **Model Rate Multiplier**: Model list now displays rate multiplier (e.g., 1.3x credit)
- 🚫 **Ban Details Dialog**: Click "Banned" label to view detailed ban info and support link
- ✅ **Button Click Feedback**: Added success feedback for API Key copy and generate buttons
- 🎨 **Models List UI**: Improved dual-column grid layout for proxy models dialog
- 🎯 **Subscription Flow Refactor**: Clicking subscription label now fetches available subscriptions first, then displays plan selection page
- 👤 **First-time User Support**: Properly handle first-time user subscription flow using `qSubscriptionType` parameter
- 💳 **Manage Billing Button**: All accounts now show "Manage Billing" button regardless of subscription status
- 📋 **Auto Copy Link**: Payment link is automatically copied to clipboard when selecting a subscription plan
- ✅ **Copy Success Toast**: Shows green "Link copied to clipboard!" message, auto-closes dialog after 800ms
- ❌ **Error Messages**: Shows red error message in dialog when subscription operations fail
- 🔧 **API Fix**: Fixed to use correct `x-amzn-codewhisperer-optout-preference` request header
- 🌐 **API Proxy Claude Code Support**: Added `/anthropic/v1/messages`, `/v1/messages/count_tokens`, `/api/event_logging/batch` endpoints
- 💾 **Proxy Config Persistence**: Port and host changes are now automatically saved
- 🔒 **Enhanced CORS Headers**: Added more request headers support for Claude Code compatibility
- 📏 **Tool Description Length Limit**: Auto-truncate tool descriptions exceeding 10240 bytes
- 📝 **Content Non-empty Check**: Ensure message content sent to Kiro API is non-empty

### v1.3.6 (2025-01-17)
- 🔑 **API Key Persistence**: API Key is now persisted and preserved after app restart
- 👁️ **API Key Show/Hide**: Added toggle to show/hide API Key in input field
- 🚀 **Auto Start Fix**: Fixed "Auto Start" feature not working properly
- 📋 **API Key Copy**: One-click copy button for API Key

### v1.3.5 (2025-01-17)
- 🌐 **API Proxy Page i18n**: API Proxy Service page now supports English/Chinese language switching
- 📋 **Request Logs Display**: Added recent request logs display panel in API Proxy Service page
- 💾 **Log Persistence**: Request logs are now persisted to file and preserved after restart
- 📊 **Logs Dialog**: View all logs in a popup dialog with export and clear functions
- 🔄 **Dynamic Model Fetching**: Fetch models from Kiro API and merge with preset models
- 🔄 **Refresh Models**: Added button to manually refresh model cache
- 🚀 **Auto Start**: API Proxy Service can now auto-start when application launches
- 🔄 **Auto Restart**: Auto restart proxy service when it crashes unexpectedly (if auto-start enabled)
- 🌐 **Public Access Switch**: Quick toggle to switch between local (127.0.0.1) and public (0.0.0.0) access
- 📊 **Token Usage Fix**: Fixed token count not displaying in request logs
- 🔐 **Copy Access Token**: Can now copy Access Token when editing account or copying credentials

### v1.3.4 (2025-01-16)
- 🐛 **Multi-Account Active State Fix**: Fixed the issue where multiple accounts showed "Active" status simultaneously on some devices
- ✨ **Glow Border Effect**: Added animated glow border effect for the currently active account card
- 💬 **QQ Group**: Added QQ group information to README
- 🚀 **API Proxy Service Enhancement**:
  - Auto token refresh before expiry
  - Request retry mechanism (smart handling for 401/403/429/5xx)
  - IDC authentication support + preferred endpoint config
  - Agentic mode detection + Thinking mode support
  - System prompt injection + image processing
  - Enhanced usage statistics + management API endpoints
- 🎨 **API Proxy Page UI Update**: Consistent styling with other pages, follows theme color
- 📖 **Usage Guide**: Added API proxy service usage guide documentation
- 🐛 **Active Account Stats Fix**: Fixed "Active Accounts" count mismatch on homepage

### v1.3.3 (2025-01-15)
- 🍎 **macOS Machine ID Fix**: Fixed the issue where modified machine ID still showed the original ID after refresh
- 🍎 **macOS Permission Fix**: macOS no longer incorrectly prompts "Admin privileges required"
- 🔗 **Kiro IDE Sync**: macOS now automatically syncs machine ID to Kiro IDE's machineid file
- 🔒 **Login Private Mode**: Option to open browser in incognito/private mode when logging in online
- ⚙️ **Global Setting**: Added "Login Private Mode" toggle in settings page
- 🔄 **Temporary Toggle**: Login dialog supports temporary private mode toggle (defaults to global setting)
- 🌐 **Auto Browser Detection**: Automatically detects system default browser and uses corresponding private mode arguments
- 💻 **Multi-Browser Support**: Supports private mode for Chrome, Edge, Firefox, Brave, Opera

### v1.3.2 (2025-01-02)
- 🔄 **Auto Refresh Timer Fix**: Fixed the issue where auto refresh timer did not check account info when token is not expired
- 🔄 **Background Refresh Update Fix**: Fixed the issue where background refresh results were not updating account panel data
- 📊 **Batch Check Fix**: Fixed the issue where batch account check was not updating usage progress bar and subscription expiry time
- 🎯 **Percentage Precision**: Usage percentage display is now also controlled by "Usage Precision" setting

### v1.3.1 (2025-01-01)
- 🔧 **Check Account Button Fix**: Fixed the issue where clicking "Check Account Info" button had no visual feedback
- 🔄 **Auto Refresh Sync Fix**: Fixed the issue where "Sync Account Info" setting was not working during auto refresh
- 📊 **Usage Precision Setting**: Added option to toggle between integer and decimal display for usage values
- 🔢 **Precise Usage Data**: Backend now saves precise decimal usage data (e.g., 1.22 instead of 1)
- ⚙️ **GitHub Actions Optimization**: Removed tag trigger, now only supports manual trigger; release is no longer draft by default
- 🐛 **Import Fix**: Fixed the issue where accounts with same email but different providers (GitHub/Google) could not be imported

### v1.3.0 (2025-12-30)
- 🌐 **Multi-Language Support**: Full English/Chinese bilingual interface
- 🌐 **Language Settings**: Auto-detect system language or manual selection
- 🐧 **Linux Fix**: Fixed launch failure when installation path contains spaces
- 🐧 **Linux Fix**: Fixed machine ID privilege escalation failure on Wayland
- 🍎 **macOS Fix**: Fixed DMG signing issue
- 🔧 **Edit Account Optimization**: Social login accounts (Google/GitHub) now only show Refresh Token when editing
- ⚙️ **Auto Refresh Settings**: Added "Sync Account Info" toggle to control whether to detect usage and ban status during refresh

### v1.2.9 (2025-12-17)
- 🔍 **Batch Check Fix**: Batch check now works same as single check, correctly detecting ban status
- 📤 **Export Enhancement**: TXT and Clipboard export with "Include Credentials" can be directly used for import
- 🏢 **Teams Subscription**: Added Teams subscription type recognition
- 🎨 **Machine ID Page**: Redesigned page with new statistics cards and optimized layout
- 🎯 **Theme Color Unity**: Machine ID page colors follow user selected theme

### v1.2.5 (2025-12-09)
- 🎨 **Theme System Upgrade**: Theme colors increased from 13 to 21, grouped by color family
- 📊 **Quota Statistics**: Added total quota statistics card on home page
- 💾 **Multi-Format Export**: Support JSON, TXT, CSV, Clipboard formats
- 🔧 **Machine ID Optimization**: Added search function and last modified time display
- 🐛 **Fix**: Fixed some theme color switching issues

### v1.1.0
- Added machine ID management
- Added batch set groups/tags
- Optimized auto refresh, sync update account info
- Added 13 theme colors
- UI optimization and bug fixes

### v1.0.0
- Initial release
- Multi-account management and switching
- Auto token refresh
- Groups and tags management
- Privacy mode and proxy settings

---

## 📄 License

This project is licensed under the [AGPL-3.0 License](LICENSE).

---

## 👨‍💻 Author

- **GitHub**: [chaogei](https://github.com/chaogei)
- **Project Homepage**: [Kiro-account-manager](https://github.com/chaogei/Kiro-account-manager)

---

## 🙏 Acknowledgments

Thanks to all users who use and support this project!

If this project helps you, please give it a Star ⭐!
