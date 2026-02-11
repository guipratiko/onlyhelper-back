import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { connectMongo } from './config/db.js';
import { connectPostgres } from './config/postgres.js';
import { initPostgresTables } from './config/initPostgres.js';
import { initWs, broadcast } from './ws.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import ticketsRoutes from './routes/tickets.js';
import subjectsRoutes from './routes/subjects.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

await connectMongo();
await connectPostgres();
await initPostgresTables();

const app = express();

// CORS: em produção use CORS_ORIGIN (ex.: https://seusite.com ou vários separados por vírgula)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Em produção: servir frontend estático (build em backend/public)
if (isProduction) {
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const server = http.createServer(app);
initWs(server);

// Expor broadcast para as rotas usarem
app.set('wsBroadcast', broadcast);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`OnlyHelper API rodando na porta ${PORT}${isProduction ? ' (produção)' : ''}`);
});
