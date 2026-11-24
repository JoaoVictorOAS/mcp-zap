# WhatsApp MCP Server Implementation Plan (with SQLite & Batch Group Support)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Model Context Protocol (MCP) server in TypeScript that connects to personal WhatsApp via `@whiskeysockets/baileys`, stores messages/chats locally in SQLite (`node:sqlite`), supports batch pagination (fetching older messages by cursor/timestamp), reads groups with participant resolution, and authenticates via terminal QR code.

**Architecture:** 
- A standalone TypeScript/Node.js project.
- Data layer: Built-in `node:sqlite` database (`data/whatsapp.db`) storing `chats`, `messages`, and `contacts`.
- WhatsApp integration: `@whiskeysockets/baileys` configured with `syncFullHistory: true`, listening to `messaging-history.set` and `messages.upsert` to persist messages continuously into SQLite. Supports `sock.fetchMessageHistory()` for paging back beyond initial cache.
- Group handling: Identifies `@g.us` chats, maps `participant` to contact names, and provides group metadata.
- CLI Entrypoints:
  - `npm run auth`: Interactive terminal script displaying ASCII QR code to link device and save credentials into `.auth/`.
  - `npm start`: MCP stdio server with silent/stderr logging, exposing rich query tools.

**Tech Stack:** TypeScript, Node.js 26 (`node:sqlite`), `@whiskeysockets/baileys`, `@modelcontextprotocol/sdk`, `pino`, `qrcode-terminal`, `zod`.

## Global Constraints

- Must never write logs to `stdout` during MCP server operation; all logging must use `stderr` or `pino({ level: 'silent' })`.
- Database (`data/`) and Auth (`.auth/`) directories must be in `.gitignore`.
- Group messages must include participant identifier (who sent the message inside the group).
- Message pagination must support batching via `limit` and `before_timestamp` (cursor pagination).

## Review Focus

- Batch pagination: Verify `whatsapp_get_messages` retrieves older chunks correctly when given `before_timestamp`.
- Group chat differentiation: Verify groups (`@g.us`) display group subject and sender names, rather than confusing sender with group.
- Large batch ingestion: Verify `messaging-history.set` handles bulk message writes inside an SQLite transaction for maximum speed.
- Empty or unauthenticated start: Graceful error message without process crash if `.auth/` is missing.

---

### Task 1: Project Scaffolding & Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create package.json and tsconfig.json**
Configure ESM project with dependencies: `@modelcontextprotocol/sdk`, `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, `zod`, and devDependencies: `typescript`, `@types/node`, `@types/qrcode-terminal`, `tsx`. Include node flags `--experimental-sqlite` where appropriate.

- [ ] **Step 2: Create .gitignore**
Ignore `node_modules/`, `dist/`, `.auth/`, `data/`, and `.env`.

- [ ] **Step 3: Run npm install**
Verify all packages install cleanly.

- [ ] **Step 4: Commit**
```bash
git add package.json tsconfig.json .gitignore README.md
git commit -m "chore: initialize project scaffolding and dependencies"
```

---

### Task 2: SQLite Storage Layer (`node:sqlite`)

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/types.ts`
- Create: `tests/storage.test.ts`

**Interfaces:**
- Produces: `DatabaseManager` with methods:
  - `upsertChat(chat)`
  - `upsertMessages(messages[])`
  - `getChats({ filter, limit, offset })`
  - `getMessages({ jid, limit, beforeTimestamp })`
  - `searchMessages({ query, limit })`
  - `getOldestMessage(jid)`

- [ ] **Step 1: Define storage schema and types in `src/storage/types.ts`**
- [ ] **Step 2: Implement SQLite database operations in `src/storage/db.ts`**
Create tables (`chats`, `messages`, `contacts`) with indexes on `chat_id`, `timestamp`, and `sender_jid`. Use prepared statements and transactions for batch inserts.
- [ ] **Step 3: Test storage methods**
Run test script verifying insert, batch query, and timestamp pagination.
- [ ] **Step 4: Commit**
```bash
git add src/storage/ tests/
git commit -m "feat: implement sqlite storage layer for chats and batch messages"
```

---

### Task 3: WhatsApp Client & History Sync

**Files:**
- Create: `src/whatsapp/client.ts`
- Create: `src/whatsapp/parser.ts`
- Create: `src/auth.ts`

**Interfaces:**
- Consumes: `DatabaseManager` from `src/storage/db.ts`, `@whiskeysockets/baileys`
- Produces: `WhatsAppClient` class with history synchronization and group metadata.
- Produces: `src/auth.ts` CLI pairing tool.

- [ ] **Step 1: Implement message text parser in `src/whatsapp/parser.ts`**
Extract plain text from `conversation`, `extendedTextMessage`, `imageMessage` caption, `videoMessage` caption, `documentMessage`, `quotedMessage`, etc.
- [ ] **Step 2: Implement `WhatsAppClient` in `src/whatsapp/client.ts`**
Configure socket with:
  - `syncFullHistory: true`
  - Event listener `messaging-history.set` (batch save to SQLite)
  - Event listener `messages.upsert` (save incoming messages)
  - Method `fetchOlderMessages(jid, count)` using `sock.fetchMessageHistory`
  - Method `getGroupMetadata(jid)`
- [ ] **Step 3: Implement `src/auth.ts`**
Terminal script with QR code display and auto-exit when connected.
- [ ] **Step 4: Test TypeScript compile**
- [ ] **Step 5: Commit**
```bash
git add src/whatsapp/ src/auth.ts
git commit -m "feat: implement whatsapp client with full history sync and group support"
```

---

### Task 4: MCP Server & Tools Implementation

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

**Interfaces:**
- Produces: MCP server over `StdioServerTransport` exposing:
  - `whatsapp_status`: connection and sync status.
  - `whatsapp_list_chats`: list chats (supports filter: `'all' | 'direct' | 'groups'`, pagination).
  - `whatsapp_get_messages`: batch load messages for a chat/group, with `limit` (e.g. 20, 50) and `before_timestamp` (cursor for older messages).
  - `whatsapp_search_messages`: search across all stored messages.
  - `whatsapp_fetch_older_messages`: explicitly request older historical messages from WhatsApp servers for a chat/group.
  - `whatsapp_get_group_info`: details about a group (name, owner, description, participant count/list).

- [ ] **Step 1: Implement MCP server and register tools in `src/server.ts`**
- [ ] **Step 2: Implement entrypoint in `src/index.ts`**
- [ ] **Step 3: Test compilation and verify stdio launch**
- [ ] **Step 4: Commit**
```bash
git add src/server.ts src/index.ts
git commit -m "feat: implement mcp server with batch message and group tools"
```

---

### Task 5: Documentation & Client Configuration

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add complete documentation to README.md**
Include usage, pairing instructions, batching examples, and MCP client config for Claude Desktop, Cursor, Antigravity.
- [ ] **Step 2: Final commit**
```bash
git add README.md
git commit -m "docs: finalize setup, batch querying, and group reading documentation"
```
