import { Router } from 'express';
import { getPool } from '../config/postgres.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

function getBroadcast(req) {
  return req.app.get('wsBroadcast');
}

// POST /api/tickets — criar ticket (embed/visitante). Sem auth por enquanto.
router.post('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });

  const { visitor_session_id: visitorSessionId, visitor_name: visitorName, subject_id: subjectId } = req.body || {};
  try {
    const { rows } = await pool.query(
      `INSERT INTO tickets (status, visitor_session_id, visitor_name, subject_id) VALUES ('waiting', $1, $2, $3) RETURNING id, status, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", subject_id AS "subjectId", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [visitorSessionId || null, visitorName || null, subjectId || null]
    );
    getBroadcast(req)?.('tickets_update', {});
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar ticket:', err);
    res.status(500).json({ error: 'Erro ao criar ticket' });
  }
});

// GET /api/tickets/by-session/:sessionId — público, para o widget do embed obter ticket e posição na fila
router.get('/by-session/:sessionId', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });

  const { sessionId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, status, visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", subject_id AS "subjectId", created_at AS "createdAt"
       FROM tickets WHERE visitor_session_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket não encontrado' });

    const ticket = rows[0];
    if (ticket.status === 'waiting') {
      const { rows: posRows } = await pool.query(
        `SELECT COUNT(*)::int AS position FROM tickets WHERE status = 'waiting' AND created_at <= $1`,
        [ticket.createdAt]
      );
      ticket.position = posRows[0]?.position ?? 1;
    }
    res.json(ticket);
  } catch (err) {
    console.error('Erro ao buscar ticket por sessão:', err);
    res.status(500).json({ error: 'Erro ao buscar ticket' });
  }
});

async function canAccessTicket(pool, ticketId, userId, visitorSessionId, userRole) {
  if (userRole && String(userRole).toLowerCase() === 'admin') return true;
  const { rows } = await pool.query(
    'SELECT id, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId" FROM tickets WHERE id = $1',
    [ticketId]
  );
  if (rows.length === 0) return false;
  const t = rows[0];
  if (userId && t.assignedTo === userId) return true;
  if (visitorSessionId && t.visitorSessionId === visitorSessionId) return true;
  return false;
}

function getUserRole(user) {
  if (!user) return undefined;
  const r = user.role ?? (typeof user.get === 'function' ? user.get('role') : undefined);
  return r != null ? String(r).toLowerCase() : undefined;
}

// GET /api/tickets/:id/messages — atendente (auth) ou visitante (?session_id=)
router.get('/:id/messages', optionalAuthMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  const { id: ticketId } = req.params;
  const userId = req.user?._id?.toString();
  const sessionId = req.query.session_id;

  try {
    const userRole = getUserRole(req.user);
    const ok = await canAccessTicket(pool, ticketId, userId, sessionId, userRole);
    if (!ok) return res.status(403).json({ error: 'Acesso negado a este ticket' });

    const { rows } = await pool.query(
      `SELECT id, ticket_id AS "ticketId", sender_type AS "senderType", sender_id AS "senderId", content, attachment_data AS "attachmentData", created_at AS "createdAt"
       FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [ticketId]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error('Erro ao listar mensagens:', err);
    res.status(500).json({ error: 'Erro ao listar mensagens' });
  }
});

// POST /api/tickets/:id/messages — atendente (auth) ou visitante (body.session_id)
router.post('/:id/messages', optionalAuthMiddleware, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  const { id: ticketId } = req.params;
  const { content, session_id: sessionId, attachment } = req.body || {};
  const userId = req.user?._id?.toString();

  const text = typeof content === 'string' ? content.trim() : '';
  const hasAttachment = typeof attachment === 'string' && attachment.startsWith('data:image/');
  if (!text && !hasAttachment) {
    return res.status(400).json({ error: 'Envie um texto ou uma imagem.' });
  }

  try {
    const userRole = getUserRole(req.user);
    const ok = await canAccessTicket(pool, ticketId, userId, sessionId, userRole);
    if (!ok) return res.status(403).json({ error: 'Acesso negado a este ticket' });

    const senderType = userId ? 'attendant' : 'visitor';
    const senderId = userId || null;
    const contentVal = text || ' ';
    const attachmentVal = hasAttachment ? attachment : null;

    const { rows } = await pool.query(
      `INSERT INTO messages (ticket_id, sender_type, sender_id, content, attachment_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ticket_id AS "ticketId", sender_type AS "senderType", sender_id AS "senderId", content, attachment_data AS "attachmentData", created_at AS "createdAt"`,
      [ticketId, senderType, senderId, contentVal, attachmentVal]
    );
    const message = rows[0];
    getBroadcast(req)?.('message_new', { ticketId, message });
    res.status(201).json(message);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

router.use(authMiddleware);

// GET /api/tickets?status=waiting|in_progress|closed&assigned_to=me
router.get('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });

  const { status, assigned_to: assignedTo } = req.query;
  const userId = req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  const subjectIds = req.user.subjectIds && Array.isArray(req.user.subjectIds) ? req.user.subjectIds : [];

  try {
    let query = 'SELECT id, status, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", subject_id AS "subjectId", created_at AS "createdAt", updated_at AS "updatedAt" FROM tickets WHERE 1=1';
    const params = [];
    let n = 1;

    if (status) {
      query += ` AND status = $${n}`;
      params.push(status);
      n++;
    }
    if (assignedTo === 'me') {
      query += ` AND assigned_to = $${n}`;
      params.push(userId);
      n++;
    } else if (status === 'waiting' && !isAdmin) {
      if (subjectIds.length === 0) {
        query += ' AND 1=0';
      } else {
        query += ` AND subject_id = ANY($${n}::uuid[])`;
        params.push(subjectIds);
        n++;
      }
    }
    // Admin sem assigned_to=me: vê todos (fila + em andamento); não aplicamos filtro extra

    query += ' ORDER BY created_at ASC';

    const { rows } = await pool.query(query, params);
    res.json({ tickets: rows });
  } catch (err) {
    console.error('Erro ao listar tickets:', err);
    res.status(500).json({ error: 'Erro ao listar tickets' });
  }
});

// PATCH /api/tickets/:id — assumir ticket ou alterar status
router.patch('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });

  const { id } = req.params;
  const { action, status: newStatus } = req.body; // action: 'take' | 'close'; ou status direto
  const userId = req.user._id.toString();

  try {
    if (action === 'take') {
      const { rows } = await pool.query(
        `UPDATE tickets SET status = 'in_progress', assigned_to = $1, updated_at = NOW() WHERE id = $2 AND status = 'waiting' RETURNING id, status, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [userId, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Ticket não encontrado ou já atribuído' });
      getBroadcast(req)?.('tickets_update', {});
      return res.json(rows[0]);
    }
    if (action === 'close' || newStatus === 'closed') {
      const isAdmin = req.user.role === 'admin';
      const updateQuery = isAdmin
        ? `UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = $1 RETURNING id, status, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", created_at AS "createdAt", updated_at AS "updatedAt"`
        : `UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = $1 AND assigned_to = $2 RETURNING id, status, assigned_to AS "assignedTo", visitor_session_id AS "visitorSessionId", visitor_name AS "visitorName", created_at AS "createdAt", updated_at AS "updatedAt"`;
      const updateParams = isAdmin ? [id] : [id, userId];
      const { rows } = await pool.query(updateQuery, updateParams);
      if (rows.length === 0) return res.status(404).json({ error: 'Ticket não encontrado' });
      getBroadcast(req)?.('tickets_update', {});
      return res.json(rows[0]);
    }
    return res.status(400).json({ error: 'Ação inválida. Use action: "take" ou "close".' });
  } catch (err) {
    console.error('Erro ao atualizar ticket:', err);
    res.status(500).json({ error: 'Erro ao atualizar ticket' });
  }
});

export default router;
