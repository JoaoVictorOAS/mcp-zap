import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  ChatRecord,
  MessageRecord,
  ContactRecord,
  GetChatsOptions,
  GetMessagesOptions
} from './types.js';

export class DatabaseManager {
  private db: DatabaseSync;

  constructor(dbPath: string = 'data/whatsapp.db') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        jid TEXT PRIMARY KEY,
        name TEXT,
        is_group INTEGER NOT NULL,
        unread_count INTEGER DEFAULT 0,
        last_message_time INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender_jid TEXT NOT NULL,
        sender_name TEXT,
        from_me INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        text TEXT NOT NULL,
        media_type TEXT,
        raw_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp 
      ON messages(chat_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_text 
      ON messages(text);

      CREATE TABLE IF NOT EXISTS contacts (
        jid TEXT PRIMARY KEY,
        name TEXT,
        notify TEXT
      );
    `);
  }

  public upsertChat(chat: ChatRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO chats (jid, name, is_group, unread_count, last_message_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = coalesce(excluded.name, chats.name),
        unread_count = excluded.unread_count,
        last_message_time = max(coalesce(chats.last_message_time, 0), coalesce(excluded.last_message_time, 0))
    `);
    stmt.run(
      chat.jid,
      chat.name,
      chat.isGroup ? 1 : 0,
      chat.unreadCount,
      chat.lastMessageTime
    );
  }

  public upsertChats(chats: ChatRecord[]): void {
    if (chats.length === 0) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO chats (jid, name, is_group, unread_count, last_message_time)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(jid) DO UPDATE SET
          name = coalesce(excluded.name, chats.name),
          unread_count = excluded.unread_count,
          last_message_time = max(coalesce(chats.last_message_time, 0), coalesce(excluded.last_message_time, 0))
      `);
      for (const chat of chats) {
        stmt.run(
          chat.jid,
          chat.name,
          chat.isGroup ? 1 : 0,
          chat.unreadCount,
          chat.lastMessageTime
        );
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public upsertMessages(messages: MessageRecord[]): void {
    if (messages.length === 0) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const msgStmt = this.db.prepare(`
        INSERT INTO messages (id, chat_id, sender_jid, sender_name, from_me, timestamp, text, media_type, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          text = excluded.text,
          media_type = excluded.media_type
      `);

      const chatStmt = this.db.prepare(`
        INSERT INTO chats (jid, name, is_group, unread_count, last_message_time)
        VALUES (?, null, ?, 0, ?)
        ON CONFLICT(jid) DO UPDATE SET
          last_message_time = max(coalesce(chats.last_message_time, 0), excluded.last_message_time)
      `);

      for (const msg of messages) {
        msgStmt.run(
          msg.id,
          msg.chatId,
          msg.senderJid,
          msg.senderName,
          msg.fromMe ? 1 : 0,
          msg.timestamp,
          msg.text,
          msg.mediaType,
          msg.rawJson || null
        );

        const isGroup = msg.chatId.endsWith('@g.us') ? 1 : 0;
        chatStmt.run(msg.chatId, isGroup, msg.timestamp);
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public upsertContacts(contacts: ContactRecord[]): void {
    if (contacts.length === 0) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO contacts (jid, name, notify)
        VALUES (?, ?, ?)
        ON CONFLICT(jid) DO UPDATE SET
          name = coalesce(excluded.name, contacts.name),
          notify = coalesce(excluded.notify, contacts.notify)
      `);
      for (const c of contacts) {
        stmt.run(c.jid, c.name, c.notify);
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public getChats(options?: GetChatsOptions): ChatRecord[] {
    const filter = options?.filter ?? 'all';
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let filterClause = '';
    if (filter === 'groups') {
      filterClause = 'WHERE is_group = 1';
    } else if (filter === 'direct') {
      filterClause = 'WHERE is_group = 0';
    }

    const query = `
      SELECT jid, name, is_group, unread_count, last_message_time
      FROM chats
      ${filterClause}
      ORDER BY coalesce(last_message_time, 0) DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(limit, offset) as Array<{
      jid: string;
      name: string | null;
      is_group: number;
      unread_count: number;
      last_message_time: number | null;
    }>;

    return rows.map(r => ({
      jid: r.jid,
      name: r.name,
      isGroup: r.is_group === 1,
      unreadCount: r.unread_count,
      lastMessageTime: r.last_message_time
    }));
  }

  public getMessages(options: GetMessagesOptions): MessageRecord[] {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const beforeTimestamp = options.beforeTimestamp;

    let query: string;
    let params: (string | number)[];

    if (beforeTimestamp !== undefined) {
      query = `
        SELECT id, chat_id, sender_jid, sender_name, from_me, timestamp, text, media_type, raw_json
        FROM messages
        WHERE chat_id = ? AND timestamp < ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [options.jid, beforeTimestamp, limit];
    } else {
      query = `
        SELECT id, chat_id, sender_jid, sender_name, from_me, timestamp, text, media_type, raw_json
        FROM messages
        WHERE chat_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      params = [options.jid, limit];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      chat_id: string;
      sender_jid: string;
      sender_name: string | null;
      from_me: number;
      timestamp: number;
      text: string;
      media_type: string | null;
      raw_json: string | null;
    }>;

    // Return in chronological order (oldest to newest within the retrieved batch)
    return rows.reverse().map(r => ({
      id: r.id,
      chatId: r.chat_id,
      senderJid: r.sender_jid,
      senderName: r.sender_name,
      fromMe: r.from_me === 1,
      timestamp: r.timestamp,
      text: r.text,
      mediaType: r.media_type,
      rawJson: r.raw_json
    }));
  }

  public getOldestMessage(jid: string): MessageRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, chat_id, sender_jid, sender_name, from_me, timestamp, text, media_type, raw_json
      FROM messages
      WHERE chat_id = ?
      ORDER BY timestamp ASC
      LIMIT 1
    `);
    const row = stmt.get(jid) as {
      id: string;
      chat_id: string;
      sender_jid: string;
      sender_name: string | null;
      from_me: number;
      timestamp: number;
      text: string;
      media_type: string | null;
      raw_json: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      chatId: row.chat_id,
      senderJid: row.sender_jid,
      senderName: row.sender_name,
      fromMe: row.from_me === 1,
      timestamp: row.timestamp,
      text: row.text,
      mediaType: row.media_type,
      rawJson: row.raw_json
    };
  }

  public searchMessages(query: string, limit: number = 20): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, chat_id, sender_jid, sender_name, from_me, timestamp, text, media_type, raw_json
      FROM messages
      WHERE text LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(`%${query}%`, limit) as Array<{
      id: string;
      chat_id: string;
      sender_jid: string;
      sender_name: string | null;
      from_me: number;
      timestamp: number;
      text: string;
      media_type: string | null;
      raw_json: string | null;
    }>;

    return rows.map(r => ({
      id: r.id,
      chatId: r.chat_id,
      senderJid: r.sender_jid,
      senderName: r.sender_name,
      fromMe: r.from_me === 1,
      timestamp: r.timestamp,
      text: r.text,
      mediaType: r.media_type,
      rawJson: r.raw_json
    }));
  }

  public getContactName(jid: string): string | null {
    const stmt = this.db.prepare(`
      SELECT name, notify FROM contacts WHERE jid = ?
    `);
    const row = stmt.get(jid) as { name: string | null; notify: string | null } | undefined;
    return row?.name || row?.notify || null;
  }

  public close(): void {
    this.db.close();
  }
}
