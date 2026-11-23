# WhatsApp MCP Server

Servidor MCP (*Model Context Protocol*) para integração direta com seu WhatsApp pessoal, leitura de mensagens anteriores em lotes (paginação por timestamp), leitura completa de grupos (identificando participantes) e autenticação local via QR Code.

Construído com `@whiskeysockets/baileys` e SQLite local (`node:sqlite`).

## Pré-requisitos
- Node.js 22+ (ou 26+)
- Conexão de rede para sincronização inicial com os servidores do WhatsApp.

## Como Usar

### 1. Instalar dependências
```bash
npm install
```

### 2. Autenticar via QR Code
Execute o script de pareamento:
```bash
npm run auth
```
Aponte a câmera do seu celular no WhatsApp (`Aparelhos conectados` > `Conectar um aparelho`) para o QR Code exibido no terminal. Suas credenciais serão salvas de forma segura na pasta `.auth/`.

### 3. Iniciar o servidor MCP
```bash
npm start
```
