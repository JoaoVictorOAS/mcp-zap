import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/storage/db.js';

test('DatabaseManager - in-memory CRUD & pagination tests', async (t) => {
  const db = new DatabaseManager(':memory:');

  await t.test('should upsert and retrieve chats and differentiate groups', () => {
    db.upsertChat({
      jid: 'user1@s.whatsapp.net',
      name: 'João Victor',
      isGroup: false,
      unreadCount: 2,
      lastMessageTime: 1000
    });

    db.upsertChat({
      jid: 'group1@g.us',
      name: 'Amigos Devs',
      isGroup: true,
      unreadCount: 0,
      lastMessageTime: 2000
    });

    const allChats = db.getChats({ filter: 'all' });
    assert.equal(allChats.length, 2);
    assert.equal(allChats[0].name, 'Amigos Devs'); // Sorted by lastMessageTime DESC

    const groupsOnly = db.getChats({ filter: 'groups' });
    assert.equal(groupsOnly.length, 1);
    assert.equal(groupsOnly[0].isGroup, true);
    assert.equal(groupsOnly[0].jid, 'group1@g.us');

    const directOnly = db.getChats({ filter: 'direct' });
    assert.equal(directOnly.length, 1);
    assert.equal(directOnly[0].isGroup, false);
    assert.equal(directOnly[0].jid, 'user1@s.whatsapp.net');
  });

  await t.test('should batch upsert messages and support cursor pagination', () => {
    const groupJid = 'group1@g.us';
    const messages = [
      {
        id: 'msg_1',
        chatId: groupJid,
        senderJid: 'user1@s.whatsapp.net',
        senderName: 'João',
        fromMe: false,
        timestamp: 100,
        text: 'Primeira mensagem antiga',
        mediaType: null
      },
      {
        id: 'msg_2',
        chatId: groupJid,
        senderJid: 'user2@s.whatsapp.net',
        senderName: 'Carlos',
        fromMe: false,
        timestamp: 200,
        text: 'Segunda mensagem',
        mediaType: null
      },
      {
        id: 'msg_3',
        chatId: groupJid,
        senderJid: 'user1@s.whatsapp.net',
        senderName: 'João',
        fromMe: false,
        timestamp: 300,
        text: 'Terceira mensagem recente',
        mediaType: null
      }
    ];

    db.upsertMessages(messages);

    // Fetch latest 2 messages
    const latestBatch = db.getMessages({ jid: groupJid, limit: 2 });
    assert.equal(latestBatch.length, 2);
    // Should be chronological msg_2, msg_3
    assert.equal(latestBatch[0].id, 'msg_2');
    assert.equal(latestBatch[1].id, 'msg_3');

    // Fetch older batch before timestamp 200 (cursor)
    const olderBatch = db.getMessages({
      jid: groupJid,
      limit: 2,
      beforeTimestamp: 200
    });
    assert.equal(olderBatch.length, 1);
    assert.equal(olderBatch[0].id, 'msg_1');
    assert.equal(olderBatch[0].text, 'Primeira mensagem antiga');

    // Check oldest message helper
    const oldest = db.getOldestMessage(groupJid);
    assert.ok(oldest);
    assert.equal(oldest.id, 'msg_1');
    assert.equal(oldest.timestamp, 100);
  });

  await t.test('should search messages by keyword', () => {
    const results = db.searchMessages('antiga');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'msg_1');
  });

  await t.test('should retrieve message by id with rawJson', () => {
    const msg = db.getMessageById('msg_1');
    assert.ok(msg);
    assert.equal(msg.id, 'msg_1');
    assert.equal(msg.chatId, 'group1@g.us');
  });

  db.close();
});
