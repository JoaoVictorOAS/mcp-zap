import { proto } from '@whiskeysockets/baileys';
import { MessageRecord } from '../storage/types.js';

export function parseMessage(msg: proto.IWebMessageInfo): MessageRecord | null {
  const key = msg.key;
  if (!key || !key.remoteJid || !key.id) {
    return null;
  }

  const chatId = key.remoteJid;
  const isGroup = chatId.endsWith('@g.us');
  const fromMe = Boolean(key.fromMe);

  let senderJid = key.remoteJid;
  if (isGroup) {
    senderJid = key.participant || msg.participant || '';
  } else if (fromMe) {
    senderJid = 'me';
  }

  const senderName = msg.pushName || null;

  let timestamp = 0;
  if (typeof msg.messageTimestamp === 'number') {
    timestamp = msg.messageTimestamp;
  } else if (typeof msg.messageTimestamp === 'bigint') {
    timestamp = Number(msg.messageTimestamp);
  } else if (msg.messageTimestamp) {
    timestamp = Number(msg.messageTimestamp);
  }
  if (!timestamp || isNaN(timestamp)) {
    timestamp = Math.floor(Date.now() / 1000);
  }

  const m = msg.message;
  let text = '';
  let mediaType: string | null = null;

  if (m) {
    if (m.conversation) {
      text = m.conversation;
    } else if (m.extendedTextMessage?.text) {
      text = m.extendedTextMessage.text;
    } else if (m.imageMessage) {
      mediaType = 'image';
      text = m.imageMessage.caption ? `[Imagem: ${m.imageMessage.caption}]` : '[Imagem]';
    } else if (m.videoMessage) {
      mediaType = 'video';
      text = m.videoMessage.caption ? `[Vídeo: ${m.videoMessage.caption}]` : '[Vídeo]';
    } else if (m.audioMessage) {
      mediaType = 'audio';
      text = '[Áudio]';
    } else if (m.documentMessage) {
      mediaType = 'document';
      const fileName = m.documentMessage.fileName || 'documento';
      const caption = m.documentMessage.caption ? ` (${m.documentMessage.caption})` : '';
      text = `[Documento: ${fileName}${caption}]`;
    } else if (m.stickerMessage) {
      mediaType = 'sticker';
      text = '[Figurinha]';
    } else if (m.contactMessage) {
      mediaType = 'contact';
      text = `[Contato: ${m.contactMessage.displayName || 'Contato'}]`;
    } else if (m.locationMessage) {
      mediaType = 'location';
      text = `[Localização: ${m.locationMessage.name || m.locationMessage.address || 'Mapa'}]`;
    } else if (m.pollCreationMessage) {
      mediaType = 'poll';
      text = `[Enquete: ${m.pollCreationMessage.name || 'Nova enquete'}]`;
    } else if (m.protocolMessage) {
      // Ephemeral or deletion messages
      return null;
    } else {
      text = '[Mensagem de mídia/sistema]';
    }
  }

  return {
    id: key.id,
    chatId,
    senderJid,
    senderName,
    fromMe,
    timestamp,
    text,
    mediaType,
    rawJson: JSON.stringify(msg)
  };
}
