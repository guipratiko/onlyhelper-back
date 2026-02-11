import { Router } from 'express';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/me — dados do usuário logado (inclui status)
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'available',
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter dados' });
  }
});

// PATCH /api/me/status — atualizar status (available | busy | away)
router.patch('/status', async (req, res) => {
  const { status } = req.body;
  if (!status || !['available', 'busy', 'away'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use: available, busy ou away.' });
  }
  try {
    req.user.status = status;
    await req.user.save();
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

export default router;
