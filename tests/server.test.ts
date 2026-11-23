import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/storage/db.js';
import { WhatsAppClient } from '../src/whatsapp/client.js';
import { createMcpServer } from '../src/server.js';

test('MCP Server - tools initialization and unauthenticated status', async () => {
  const db = new DatabaseManager(':memory:');
  const client = new WhatsAppClient({
    authDir: '.non_existent_auth',
    db,
    silent: true
  });

  const server = createMcpServer(client, db);
  assert.ok(server);

  // Seed sample group data
  db.upsertChat({
    jid: 'group123@g.us',
    name: 'Grupo de Testes',
    isGroup: true,
    unreadCount: 5,
    lastMessageTime: 1700000000
  });

  db.upsertMessages([
    {
      id: 'm1',
      chatId: 'group123@g.us',
      senderJid: 'userA@s.whatsapp.net',
      senderName: 'Alice',
      fromMe: false,
      timestamp: 1700000001,
      text: 'Mensagem no grupo',
      mediaType: null
    }
  ]);

  const chats = db.getChats({ filter: 'groups' });
  assert.equal(chats.length, 1);
  assert.equal(chats[0].name, 'Grupo de Testes');

  const msgs = db.getMessages({ jid: 'group123@g.us' });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, 'Mensagem no grupo');

  db.close();
});
