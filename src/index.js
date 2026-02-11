import 'dotenv/config';
import http from 'http';
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

await connectMongo();
await connectPostgres();
await initPostgresTables();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
initWs(server);

// Expor broadcast para as rotas usarem
app.set('wsBroadcast', broadcast);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`OnlyHelper API rodando na porta ${PORT}`));
