import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

export function initWs(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  console.log('WebSocket disponível em /ws');
}

export function broadcast(event, data = {}) {
  const msg = JSON.stringify({ event, ...data });
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}
