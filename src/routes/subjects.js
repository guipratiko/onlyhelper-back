import { Router } from 'express';
import { getPool } from '../config/postgres.js';

const router = Router();

// GET /api/subjects — lista pública de assuntos ativos (para o widget)
router.get('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  try {
    const { rows } = await pool.query(
      `SELECT id, name, position FROM subjects WHERE active = true ORDER BY position ASC, name ASC`
    );
    res.json({ subjects: rows });
  } catch (err) {
    console.error('Erro ao listar assuntos:', err);
    res.status(500).json({ error: 'Erro ao listar assuntos' });
  }
});

export default router;
