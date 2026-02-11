import { getPool } from './postgres.js';

export async function initPostgresTables() {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'closed')),
        assigned_to VARCHAR(64),
        visitor_session_id VARCHAR(255),
        visitor_name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('visitor', 'attendant')),
        sender_id VARCHAR(64),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    `);
    try {
      await pool.query('ALTER TABLE messages ADD COLUMN attachment_data TEXT');
    } catch (e) {
      if (e.code !== '42701') throw e;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        position INT NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    try {
      await pool.query('ALTER TABLE tickets ADD COLUMN subject_id UUID REFERENCES subjects(id)');
    } catch (e) {
      if (e.code !== '42701') throw e;
    }
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_subject_id ON tickets(subject_id)');
    console.log('PostgreSQL: tabelas tickets, messages e subjects verificadas/criadas');
  } catch (err) {
    console.error('Erro ao inicializar tabelas Postgres:', err.message);
  }
}
