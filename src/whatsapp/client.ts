import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  WASocket,
  proto,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../storage/db.js';
import { parseMessage } from './parser.js';
import { ChatRecord, MessageRecord } from '../storage/types.js';

export interface WhatsAppClientOptions {
  authDir?: string;
  db: DatabaseManager;
  silent?: boolean;
}

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private authDir: string;
  private db: DatabaseManager;
  private silent: boolean;
  private isConnected = false;
  private isConnecting = false;
  private qrHandler?: (qr: string) => void;

  constructor(options: WhatsAppClientOptions) {
    this.authDir = options.authDir ?? '.auth';
    this.db = options.db;
    this.silent = options.silent ?? true;
  }

  public hasCredentials(): boolean {
    return (
      fs.existsSync(this.authDir) &&
      fs.existsSync(path.join(this.authDir, 'creds.json'))
    );
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      authenticated: this.hasCredentials(),
      userJid: this.sock?.user?.id || null
    };
  }

  public async connect(onQr?: (qr: string) => void): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.qrHandler = onQr;
    this.isConnecting = true;

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    // Direct all pino logging to stderr or silent
    const logger = pino({
      level: this.silent ? 'silent' : 'warn'
    }, process.stderr);

    this.sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: true,
      generateHighQualityLinkPreview: false
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.qrHandler) {
        this.qrHandler(qr);
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.isConnecting = false;
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          setTimeout(() => this.connect(this.qrHandler), 3000);
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.isConnecting = false;
      }
    });

    // Ingest full history sync batches
    this.sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
      if (chats && chats.length > 0) {
        const chatRecords: ChatRecord[] = chats.map((c) => ({
          jid: c.id,
          name: c.name || null,
          isGroup: c.id.endsWith('@g.us'),
          unreadCount: c.unreadCount || 0,
          lastMessageTime: c.conversationTimestamp ? Number(c.conversationTimestamp) : null
        }));
        this.db.upsertChats(chatRecords);
      }

      if (contacts && contacts.length > 0) {
        this.db.upsertContacts(
          contacts.map((c) => ({
            jid: c.id,
            name: c.name || null,
            notify: c.notify || null
          }))
        );
      }

      if (messages && messages.length > 0) {
        const parsed = messages
          .map((m) => parseMessage(m as proto.IWebMessageInfo))
          .filter((m): m is MessageRecord => m !== null);
        this.db.upsertMessages(parsed);
      }
    });

    // Ingest live messages
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      const parsed = messages
        .map((m) => parseMessage(m as proto.IWebMessageInfo))
        .filter((m): m is MessageRecord => m !== null);
      if (parsed.length > 0) {
        this.db.upsertMessages(parsed);
      }
    });

    // Ingest chat updates
    this.sock.ev.on('chats.upsert', (newChats) => {
      const chatRecords: ChatRecord[] = newChats.map((c) => ({
        jid: c.id,
        name: c.name || null,
        isGroup: c.id.endsWith('@g.us'),
        unreadCount: c.unreadCount || 0,
        lastMessageTime: c.conversationTimestamp ? Number(c.conversationTimestamp) : null
      }));
      this.db.upsertChats(chatRecords);
    });
  }

  public async fetchOlderMessages(jid: string, count: number = 50): Promise<{ requested: number; oldestMessageTimestamp: number | null }> {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    const oldest = this.db.getOldestMessage(jid);
    if (!oldest) {
      return { requested: 0, oldestMessageTimestamp: null };
    }

    const key = {
      id: oldest.id,
      remoteJid: oldest.chatId,
      fromMe: oldest.fromMe
    };

    // Request older chunk from WhatsApp servers
    await this.sock.fetchMessageHistory(
      Math.min(count, 50),
      key,
      oldest.timestamp
    );

    return {
      requested: Math.min(count, 50),
      oldestMessageTimestamp: oldest.timestamp
    };
  }

  public async getGroupMetadata(groupJid: string) {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não está conectado no momento.');
    }
    if (!groupJid.endsWith('@g.us')) {
      throw new Error(`JID ${groupJid} não é um grupo válido.`);
    }

    const meta = await this.sock.groupMetadata(groupJid);
    return {
      id: meta.id,
      subject: meta.subject,
      owner: meta.owner,
      creation: meta.creation,
      description: meta.desc,
      participantsCount: meta.participants.length,
      participants: meta.participants.map((p) => ({
        id: p.id,
        admin: p.admin || null,
        name: this.db.getContactName(p.id) || null
      }))
    };
  }

  public async downloadMedia(
    messageId: string,
    outputDir: string = './downloads',
    customFilename?: string
  ): Promise<{
    filePath: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    mediaType: string;
  }> {
    const record = this.db.getMessageById(messageId);
    if (!record) {
      throw new Error(`Mensagem com ID "${messageId}" não encontrada no banco de dados local.`);
    }

    if (!record.rawJson) {
      throw new Error(`A mensagem "${messageId}" não possui dados brutos para download de mídia.`);
    }

    const wamessage = JSON.parse(record.rawJson) as proto.IWebMessageInfo;
    const m = wamessage.message;
    if (!m) {
      throw new Error(`A mensagem "${messageId}" não possui conteúdo multimídia.`);
    }

    let defaultFileName = `media_${messageId}`;
    let mimeType = 'application/octet-stream';
    let detectedType = record.mediaType || 'media';

    if (m.documentMessage) {
      detectedType = 'document';
      defaultFileName = m.documentMessage.fileName || `documento_${messageId}.pdf`;
      mimeType = m.documentMessage.mimetype || 'application/pdf';
    } else if (m.imageMessage) {
      detectedType = 'image';
      mimeType = m.imageMessage.mimetype || 'image/jpeg';
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpeg';
      defaultFileName = `imagem_${messageId}.${ext}`;
    } else if (m.videoMessage) {
      detectedType = 'video';
      mimeType = m.videoMessage.mimetype || 'video/mp4';
      defaultFileName = `video_${messageId}.mp4`;
    } else if (m.audioMessage) {
      detectedType = 'audio';
      mimeType = m.audioMessage.mimetype || 'audio/ogg';
      defaultFileName = `audio_${messageId}.ogg`;
    } else if (m.stickerMessage) {
      detectedType = 'sticker';
      mimeType = m.stickerMessage.mimetype || 'image/webp';
      defaultFileName = `sticker_${messageId}.webp`;
    }

    const finalFileName = customFilename || defaultFileName;
    const resolvedDir = path.resolve(outputDir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    const destinationPath = path.join(resolvedDir, finalFileName);

    // Call Baileys downloadMediaMessage
    const buffer = await downloadMediaMessage(
      wamessage,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: (msg) => {
          if (!this.sock) throw new Error('WhatsApp não conectado para reupload de mídia');
          return this.sock.updateMediaMessage(msg);
        }
      }
    );

    await fs.promises.writeFile(destinationPath, buffer);

    return {
      filePath: destinationPath,
      fileName: finalFileName,
      fileSizeBytes: buffer.length,
      mimeType,
      mediaType: detectedType
    };
  }

  public disconnect(): void {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
  }
}
