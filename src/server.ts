import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WhatsAppClient } from './whatsapp/client.js';
import { DatabaseManager } from './storage/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'downloads');

export function createMcpServer(client: WhatsAppClient, db: DatabaseManager): McpServer {
  const server = new McpServer({
    name: 'whatsapp-mcp',
    version: '1.0.0'
  });

  // Tool 1: whatsapp_status
  server.tool(
    'whatsapp_status',
    'Verifica o status de conexão, autenticação e usuário atual do WhatsApp',
    {},
    async () => {
      const status = client.getStatus();
      let message = status.connected
        ? `WhatsApp conectado com sucesso (Conta: ${status.userJid || 'autenticada'}).`
        : status.connecting
        ? 'WhatsApp está conectando...'
        : status.authenticated
        ? 'WhatsApp autenticado, mas atualmente desconectado ou reconectando.'
        : 'Nenhuma sessão do WhatsApp encontrada. Execute "npm run auth" no terminal para parear via QR Code.';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ...status, message }, null, 2)
          }
        ]
      };
    }
  );

  // Tool 2: whatsapp_list_chats
  server.tool(
    'whatsapp_list_chats',
    'Lista conversas recentes do WhatsApp, permitindo filtrar por grupos, chats diretos e paginar',
    {
      filter: z
        .enum(['all', 'direct', 'groups'])
        .optional()
        .describe("Filtro de chats: 'all' (padrão), 'direct' (apenas pessoas) ou 'groups' (apenas grupos)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Quantidade máxima de conversas a retornar (padrão: 30, máx: 100)'),
      offset: z
        .number()
        .min(0)
        .optional()
        .describe('Deslocamento para paginação de conversas (padrão: 0)')
    },
    async ({ filter = 'all', limit = 30, offset = 0 }) => {
      const chats = db.getChats({ filter, limit, offset });

      const formatted = chats.map((c) => ({
        jid: c.jid,
        name: c.name || (c.isGroup ? 'Grupo sem nome' : c.jid.split('@')[0]),
        type: c.isGroup ? 'group' : 'direct',
        unreadCount: c.unreadCount,
        lastMessageDate: c.lastMessageTime
          ? new Date(c.lastMessageTime * 1000).toISOString()
          : null
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                totalReturned: formatted.length,
                filter,
                offset,
                chats: formatted
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // Tool 3: whatsapp_get_messages
  server.tool(
    'whatsapp_get_messages',
    'Carrega mensagens de uma conversa ou grupo em lotes, com suporte a paginação de mensagens anteriores via before_timestamp',
    {
      jid: z
        .string()
        .describe('ID da conversa ou grupo (ex: 5511999999999@s.whatsapp.net ou 12345-6789@g.us)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Quantidade de mensagens a retornar no lote (padrão: 20, máx: 100)'),
      before_timestamp: z
        .number()
        .optional()
        .describe('Timestamp Unix em segundos para buscar lote anterior (mensagens mais antigas que este valor)')
    },
    async ({ jid, limit = 20, before_timestamp }) => {
      const messages = db.getMessages({ jid, limit, beforeTimestamp: before_timestamp });

      const oldestInBatch = messages.length > 0 ? messages[0].timestamp : null;
      const oldestOverall = db.getOldestMessage(jid);
      const hasOlderInLocalDb =
        oldestInBatch !== null &&
        oldestOverall !== null &&
        oldestInBatch > oldestOverall.timestamp;

      const formatted = messages.map((m) => {
        const dateStr = new Date(m.timestamp * 1000).toLocaleString('pt-BR');
        let sender = m.fromMe ? 'Você' : m.senderName || m.senderJid.split('@')[0];
        if (m.chatId.endsWith('@g.us') && !m.fromMe) {
          sender = `[Grupo] ${sender}`;
        }
        const mediaTag = m.mediaType ? ` [Mídia: ${m.mediaType}]` : '';
        return `[ID: ${m.id}] [${dateStr}] ${sender}${mediaTag}: ${m.text}`;
      });

      const responsePayload = {
        chatJid: jid,
        messagesCount: messages.length,
        hasOlderInLocalDb,
        nextBeforeTimestamp: oldestInBatch,
        hint: hasOlderInLocalDb
          ? `Para ler o lote mais antigo anterior, chame novamente informando before_timestamp: ${oldestInBatch}`
          : 'Fim das mensagens locais. Você pode usar "whatsapp_fetch_older_messages" para solicitar mensagens históricas ao WhatsApp.',
        messages: formatted
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responsePayload, null, 2)
          }
        ]
      };
    }
  );

  // Tool 4: whatsapp_search_messages
  server.tool(
    'whatsapp_search_messages',
    'Pesquisa por mensagens salvas em qualquer conversa ou grupo contendo uma palavra ou termo',
    {
      query: z.string().describe('Termo ou frase a ser pesquisada nas mensagens'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Limite máximo de resultados (padrão: 20)')
    },
    async ({ query, limit = 20 }) => {
      const results = db.searchMessages(query, limit);

      const formatted = results.map((m) => ({
        id: m.id,
        chatJid: m.chatId,
        sender: m.fromMe ? 'Você' : m.senderName || m.senderJid.split('@')[0],
        date: new Date(m.timestamp * 1000).toLocaleString('pt-BR'),
        text: m.text
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                totalFound: formatted.length,
                results: formatted
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // Tool 5: whatsapp_fetch_older_messages
  server.tool(
    'whatsapp_fetch_older_messages',
    'Solicita mensagens históricas mais antigas diretamente aos servidores do WhatsApp para uma conversa ou grupo',
    {
      jid: z.string().describe('ID da conversa ou grupo (ex: 12345-6789@g.us)'),
      count: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Quantidade de mensagens a solicitar ao servidor (máx 50 por chamada)')
    },
    async ({ jid, count = 50 }) => {
      try {
        const result = await client.fetchOlderMessages(jid, count);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'requested',
                  message: `Solicitado lote de ${result.requested} mensagens anteriores ao timestamp ${result.oldestMessageTimestamp}. O WhatsApp sincronizará as mensagens em segundo plano.`,
                  details: result
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err)
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  // Tool 6: whatsapp_get_group_info
  server.tool(
    'whatsapp_get_group_info',
    'Obtém metadados detalhados de um grupo (nome, descrição, criador e lista de participantes)',
    {
      group_jid: z.string().describe('ID do grupo WhatsApp (terminado em @g.us)')
    },
    async ({ group_jid }) => {
      try {
        const meta = await client.getGroupMetadata(group_jid);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(meta, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err)
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  // Tool 7: whatsapp_download_media
  server.tool(
    'whatsapp_download_media',
    'Baixa arquivos, documentos (PDF, DOCX, planilhas), imagens, áudios ou vídeos recebidos em conversas ou grupos e salva no disco local',
    {
      message_id: z
        .string()
        .describe('ID da mensagem que contém o arquivo/mídia (visível no campo [ID: ...] em whatsapp_get_messages)'),
      output_dir: z
        .string()
        .optional()
        .describe('Diretório local onde o arquivo será salvo (padrão: "./downloads")'),
      custom_filename: z
        .string()
        .optional()
        .describe('Nome personalizado opcional para o arquivo (ex: "relatorio_mensal.pdf")')
    },
    async ({ message_id, output_dir = DEFAULT_DOWNLOADS_DIR, custom_filename }) => {
      try {
        const result = await client.downloadMedia(message_id, output_dir, custom_filename);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'success',
                  message: `Arquivo baixado com sucesso em "${result.filePath}".`,
                  file: result
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err)
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  return server;
}
