import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import { WhatsAppClient } from './whatsapp/client.js';
import { DatabaseManager } from './storage/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('       WhatsApp MCP - Autenticação por QR Code      ');
console.log('====================================================\n');

const db = new DatabaseManager(path.join(PROJECT_ROOT, 'data/whatsapp.db'));
const client = new WhatsAppClient({
  authDir: path.join(PROJECT_ROOT, '.auth'),
  db,
  silent: true
});

if (client.hasCredentials()) {
  console.log('Sessão prévia encontrada em .auth/');
  console.log('Verificando conexão com o WhatsApp...\n');
}

let qrReceived = false;

client.connect((qr) => {
  qrReceived = true;
  console.log('Escaneie o QR Code abaixo com o seu WhatsApp no celular:');
  console.log('(Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho)\n');
  qrcode.generate(qr, { small: true });
});

// Watch connection loop
const checkInterval = setInterval(() => {
  const status = client.getStatus();
  if (status.connected) {
    clearInterval(checkInterval);
    console.log('\n====================================================');
    console.log('✅ WhatsApp conectado e autenticado com sucesso!');
    console.log(`Usuário: ${status.userJid || 'Conta conectada'}`);
    console.log('Credenciais salvas em .auth/');
    console.log('Você já pode iniciar o servidor MCP com: npm start');
    console.log('====================================================\n');
    setTimeout(() => {
      client.disconnect();
      db.close();
      process.exit(0);
    }, 1500);
  }
}, 1000);

// Timeout after 2 minutes of inactivity
setTimeout(() => {
  if (!client.getStatus().connected) {
    if (!qrReceived && !client.hasCredentials()) {
      console.error('Tempo esgotado aguardando geração de QR code.');
    } else if (!client.getStatus().connected) {
      console.log('\nTempo esgotado para escanear o QR Code.');
    }
    client.disconnect();
    db.close();
    process.exit(1);
  }
}, 120000);
