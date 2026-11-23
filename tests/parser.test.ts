import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../src/whatsapp/parser.js';

test('parseMessage - handles direct messages and group messages', () => {
  // Test direct conversation
  const directMsg = {
    key: {
      id: 'MSG123',
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: false
    },
    pushName: 'Alice',
    messageTimestamp: 1700000000,
    message: {
      conversation: 'Olá, tudo bem?'
    }
  };

  const parsedDirect = parseMessage(directMsg);
  assert.ok(parsedDirect);
  assert.equal(parsedDirect.id, 'MSG123');
  assert.equal(parsedDirect.chatId, '5511999999999@s.whatsapp.net');
  assert.equal(parsedDirect.senderJid, '5511999999999@s.whatsapp.net');
  assert.equal(parsedDirect.senderName, 'Alice');
  assert.equal(parsedDirect.fromMe, false);
  assert.equal(parsedDirect.text, 'Olá, tudo bem?');
  assert.equal(parsedDirect.mediaType, null);

  // Test group message with participant
  const groupMsg = {
    key: {
      id: 'GROUP123',
      remoteJid: '123456789-987654@g.us',
      participant: '5521888888888@s.whatsapp.net',
      fromMe: false
    },
    pushName: 'Bob Dev',
    messageTimestamp: 1700000100,
    message: {
      extendedTextMessage: {
        text: 'Alguém já testou a nova versão?'
      }
    }
  };

  const parsedGroup = parseMessage(groupMsg);
  assert.ok(parsedGroup);
  assert.equal(parsedGroup.chatId, '123456789-987654@g.us');
  assert.equal(parsedGroup.senderJid, '5521888888888@s.whatsapp.net');
  assert.equal(parsedGroup.senderName, 'Bob Dev');
  assert.equal(parsedGroup.text, 'Alguém já testou a nova versão?');

  // Test image with caption
  const imageMsg = {
    key: {
      id: 'IMG123',
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: true
    },
    messageTimestamp: 1700000200,
    message: {
      imageMessage: {
        caption: 'Olha o gráfico'
      }
    }
  };

  const parsedImage = parseMessage(imageMsg);
  assert.ok(parsedImage);
  assert.equal(parsedImage.fromMe, true);
  assert.equal(parsedImage.mediaType, 'image');
  assert.equal(parsedImage.text, '[Imagem: Olha o gráfico]');
});
