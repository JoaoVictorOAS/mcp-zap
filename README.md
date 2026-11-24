# WhatsApp MCP Server

Servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) em TypeScript para integração com seu WhatsApp pessoal. Permite que assistentes de IA (como Claude Desktop, Cursor, Antigravity, Cline) leiam conversas, façam buscas, leiam mensagens de grupos e carreguem o histórico em lotes paginados.

Construído sobre o **`@whiskeysockets/baileys`** e o **`node:sqlite`** (SQLite nativo do Node.js).

---

## 🚀 Destaques e Funcionalidades

- **Autenticação via QR Code**: Pareamento simples no terminal com o celular (`npm run auth`), salvando as credenciais de sessão localmente em `.auth/` (você só escaneia uma vez).
- **Sem Browser / Ultra Leve**: Não roda Chrome nem Puppeteer em segundo plano. Conecta-se diretamente aos servidores do WhatsApp via WebSockets, consumindo apenas ~50MB de RAM.
- **Suporte Completo a Grupos**:
  - Duração e metadados (`whatsapp_get_group_info`).
  - Identificação clara do participante remetente em cada mensagem (`[Grupo] Nome/Número: mensagem`).
- **Leitura em Lotes e Paginação (`before_timestamp`)**:
  - Permite ao assistente ler lotes de 20, 50 ou 100 mensagens.
  - Se precisar ver mensagens mais antigas, utiliza o cursor `before_timestamp` para rolar para trás no tempo.
- **Armazenamento e Busca Local (SQLite)**:
  - Mensagens e conversas sincronizadas são indexadas em `data/whatsapp.db`.
  - Busca rápida de mensagens por texto (`whatsapp_search_messages`).
- **Seguro para MCP (Stdio Safe)**:
  - Nenhum log polui o canal `stdout`, garantindo integridade absoluta do protocolo JSON-RPC.

---

## 🛠️ Instalação e Configuração

### 1. Clonar e Instalar
```bash
git clone <url-do-repositorio> mcp-zap
cd mcp-zap
npm install
npm run build
```

### 2. Autenticar com o Celular (QR Code)
Execute o comando de autenticação no terminal:
```bash
npm run auth
```
1. Abra o WhatsApp no seu smartphone.
2. Vá em **Configurações / Opções** > **Aparelhos conectados** > **Conectar um aparelho**.
3. Aponte a câmera para o QR Code exibido no terminal.
4. Após conectar, o terminal exibirá uma mensagem de confirmação e as chaves serão salvas na pasta `.auth/`.

---

## 🔌 Configurando nos Clientes MCP

### No Claude Desktop (`claude_desktop_config.json`)
Adicione o servidor no seu arquivo de configuração:
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": [
        "--experimental-sqlite",
        "/caminho/absoluto/para/mcp-zap/dist/index.js"
      ]
    }
  }
}
```

### No Cursor (`.cursor/mcp.json` ou Configurações do Cursor)
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": [
        "--experimental-sqlite",
        "/caminho/absoluto/para/mcp-zap/dist/index.js"
      ]
    }
  }
}
```

*(Lembre-se de substituir `/caminho/absoluto/para/mcp-zap` pelo caminho real da pasta no seu sistema).*

---

## 🧰 Ferramentas MCP Disponíveis

| Ferramenta | Descrição | Parâmetros Principais |
| :--- | :--- | :--- |
| `whatsapp_status` | Informa se o WhatsApp está conectado, autenticado e qual a conta ativa. | *Nenhum* |
| `whatsapp_list_chats` | Lista conversas recentes e grupos. | `filter` (`'all'`, `'direct'`, `'groups'`), `limit`, `offset` |
| `whatsapp_get_messages` | Lê histórico de mensagens de uma conversa ou grupo em lote. | `jid` (obrigatório), `limit` (ex: 30), `before_timestamp` (cursor para buscar mensagens anteriores) |
| `whatsapp_search_messages` | Busca por palavras-chave em mensagens salvas. | `query` (termo a buscar), `limit` |
| `whatsapp_fetch_older_messages` | Solicita ao WhatsApp mensagens mais antigas que ainda não estão no banco local. | `jid` (obrigatório), `count` (máx 50) |
| `whatsapp_get_group_info` | Retorna participantes, administradores e descrição de um grupo. | `group_jid` (ID terminado em `@g.us`) |
| `whatsapp_download_media` | Baixa arquivos, PDFs, documentos, imagens e áudios recebidos para o disco local. | `message_id` (obrigatório, visível em `[ID: ...]`), `output_dir` (padrão: `./downloads`), `custom_filename` (opcional) |

---

## 💡 Exemplos de Prompts para o Assistente

- *"Liste os meus últimos 10 grupos do WhatsApp."*
- *"Leia as últimas 30 mensagens do grupo dos desenvolvedores."*
- *"Pegue as 20 mensagens anteriores a essas no mesmo grupo."*
- *"Baixe o arquivo PDF que enviaram no grupo dos desenvolvedores."*
- *"Pesquise nas minhas mensagens do WhatsApp onde mencionaram 'relatório' e baixe o documento correspondente."*
- *"Quem são os participantes e administradores do grupo X?"*

---

## 🔒 Segurança e Privacidade
- Seus dados de autenticação ficam armazenados única e exclusivamente na pasta local `.auth/`.
- Suas mensagens sincronizadas ficam armazenadas no banco local `data/whatsapp.db`.
- Ambas as pastas estão configuradas no `.gitignore` para nunca serem enviadas a repositórios remotos.
