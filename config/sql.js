const sql = require('mssql');
let _pool;

function toTsql(sqlText) {
  let i = 0;
  return sqlText.replace(/\?/g, () => `@p${i++}`);
}

function bindParams(request, params) {
  params.forEach((val, idx) => {
    const name = `p${idx}`;
    if (val === null || val === undefined) {
      request.input(name, sql.NVarChar, null);
    } else if (typeof val === 'number') {
      request.input(name, Number.isInteger(val) ? sql.Int : sql.Float, val);
    } else if (typeof val === 'boolean') {
      request.input(name, sql.Bit, val);
    } else {
      request.input(name, sql.NVarChar, String(val));
    }
  });
}

async function connect(retries = 3, delayMs = 500) {
  const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
  };

  if (!config.user || !config.password) {
    throw new Error('DB_USER and DB_PASSWORD are required');
  }

  for (let i = 0; i < retries; i++) {
    try {
      const pool = await sql.connect(config);
      console.log(`✅ Connected to SQL Server: ${config.server}/${config.database}`);
      return pool;
    } catch (e) {
      console.error(`❌ DB connection attempt ${i + 1}/${retries} failed:`, e.message);
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function getDb() {
  if (_pool) {
    return {
      async query(q, params = []) {
        const tsql = toTsql(q);
        const request = _pool.request();
        bindParams(request, params);
        const res = await request.query(tsql);
        return res.recordset || [];
      }
    };
  }
  _pool = await connect();
  return {
    async query(q, params = []) {
      const tsql = toTsql(q);
      const request = _pool.request();
      bindParams(request, params);
      const res = await request.query(tsql);
      return res.recordset || [];
    }
  };
}

module.exports = { sql, getDb };
