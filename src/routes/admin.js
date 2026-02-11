import { Router } from 'express';
import { getPool } from '../config/postgres.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// GET /api/admin/subjects — listar todos os assuntos (admin)
// POST /api/admin/subjects — criar assunto
// PUT /api/admin/subjects/:id — atualizar assunto
// DELETE /api/admin/subjects/:id — desativar ou remover
router.get('/subjects', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  try {
    const { rows } = await pool.query(
      `SELECT id, name, position, active, created_at AS "createdAt" FROM subjects ORDER BY position ASC, name ASC`
    );
    res.json({ subjects: rows });
  } catch (err) {
    console.error('Erro ao listar assuntos:', err);
    res.status(500).json({ error: 'Erro ao listar assuntos' });
  }
});

router.post('/subjects', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  const { name, position = 0 } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome do assunto é obrigatório' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO subjects (name, position) VALUES ($1, $2) RETURNING id, name, position, active, created_at AS "createdAt"`,
      [name.trim(), Number(position) || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar assunto:', err);
    res.status(500).json({ error: 'Erro ao criar assunto' });
  }
});

router.put('/subjects/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  const { id } = req.params;
  const { name, position, active } = req.body || {};
  try {
    const updates = [];
    const params = [];
    let n = 1;
    if (typeof name === 'string') {
      updates.push(`name = $${n}`);
      params.push(name.trim());
      n++;
    }
    if (typeof position === 'number') {
      updates.push(`position = $${n}`);
      params.push(position);
      n++;
    }
    if (typeof active === 'boolean') {
      updates.push(`active = $${n}`);
      params.push(active);
      n++;
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE subjects SET ${updates.join(', ')} WHERE id = $${n} RETURNING id, name, position, active, created_at AS "createdAt"`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Assunto não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar assunto:', err);
    res.status(500).json({ error: 'Erro ao atualizar assunto' });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'PostgreSQL indisponível' });
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM subjects WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Assunto não encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao remover assunto:', err);
    res.status(500).json({ error: 'Erro ao remover assunto' });
  }
});

// GET /api/admin/collaborators — listar colaboradores (atendentes) com subjectIds
// PATCH /api/admin/collaborators/:userId — atualizar subjectIds do colaborador
router.get('/collaborators', async (req, res) => {
  try {
    const users = await User.find(
      { role: { $in: ['attendant', 'user'] } },
      { password: 0 }
    ).lean();
    const list = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      subjectIds: u.subjectIds || [],
    }));
    res.json({ collaborators: list });
  } catch (err) {
    console.error('Erro ao listar colaboradores:', err);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

router.patch('/collaborators/:userId', async (req, res) => {
  const { userId } = req.params;
  const { subjectIds } = req.body || {};
  if (!Array.isArray(subjectIds)) {
    return res.status(400).json({ error: 'subjectIds deve ser um array' });
  }
  const validIds = subjectIds.filter((s) => typeof s === 'string' && s.trim());
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { subjectIds: validIds },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'Colaborador não encontrado' });
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      subjectIds: user.subjectIds || [],
    });
  } catch (err) {
    console.error('Erro ao atualizar colaborador:', err);
    res.status(500).json({ error: 'Erro ao atualizar colaborador' });
  }
});

export default router;
