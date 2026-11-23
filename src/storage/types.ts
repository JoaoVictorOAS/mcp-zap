export interface ChatRecord {
  jid: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTime: number | null;
}

export interface MessageRecord {
  id: string;
  chatId: string;
  senderJid: string;
  senderName: string | null;
  fromMe: boolean;
  timestamp: number; // Unix timestamp in seconds
  text: string;
  mediaType: string | null;
  rawJson?: string | null;
}

export interface ContactRecord {
  jid: string;
  name: string | null;
  notify: string | null;
}

export interface GetChatsOptions {
  filter?: 'all' | 'direct' | 'groups';
  limit?: number;
  offset?: number;
}

export interface GetMessagesOptions {
  jid: string;
  limit?: number;
  beforeTimestamp?: number;
}
