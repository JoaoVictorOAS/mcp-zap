#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { DatabaseManager } from './storage/db.js';
import { createMcpServer } from './server.js';

// IMPORTANT: Never write application logs to stdout as it corrupts MCP JSON-RPC protocol
process.env.NODE_ENV = 'production';
console.log = console.error;
console.info = console.error;
console.warn = console.error;
console.debug = console.error;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main() {
  const db = new DatabaseManager(path.join(PROJECT_ROOT, 'data/whatsapp.db'));
  const client = new WhatsAppClient({
    authDir: path.join(PROJECT_ROOT, '.auth'),
    db,
    silent: true
  });

  const server = createMcpServer(client, db);
  const transport = new StdioServerTransport();

  // Try to connect to WhatsApp if credentials exist
  if (client.hasCredentials()) {
    client.connect().catch((err) => {
      console.error('[WhatsApp MCP] Erro ao reconectar:', err.message);
    });
  } else {
    console.error('[WhatsApp MCP] Aviso: Nenhuma sessão encontrada em .auth/. Execute "npm run auth" para autenticar via QR code.');
  }

  // Handle process shutdown
  const cleanup = () => {
    client.disconnect();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await server.connect(transport);
}

main().catch((error) => {
  console.error('[WhatsApp MCP Fatal Error]:', error);
  process.exit(1);
});
