import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool && process.env.POSTGRES_URI) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URI,
    });
  }
  return pool;
}

export async function connectPostgres() {
  const uri = process.env.POSTGRES_URI;
  if (!uri) {
    console.log('POSTGRES_URI não definida — PostgreSQL não conectado');
    return null;
  }
  try {
    const p = getPool();
    if (p) {
      const client = await p.connect();
      client.release();
      console.log('PostgreSQL (onlyhelper) conectado com sucesso');
      return p;
    }
  } catch (err) {
    console.error('Erro ao conectar ao PostgreSQL:', err.message);
  }
  return null;
}
