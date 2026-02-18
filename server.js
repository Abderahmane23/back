// server.js - Updated for Beam Cloud & Static Image Serving
require('dotenv').config();
const path = require('path');
const fastify = require('fastify');
const { getDb } = require('./config/sql');

const app = fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'info' : 'error'
  },
  connectionTimeout: 30000,
  keepAliveTimeout: 5000,
  requestTimeout: 15000,
  ignoreTrailingSlash: true // Handle both /api/products and /api/products/
 });
 
async function ensureSchema(db) {
  await db.query(`
    IF OBJECT_ID(N'dbo.Daily_Task', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Daily_Task (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Day DATE NOT NULL,
        Task NVARCHAR(200) NOT NULL,
        Task_Is_Completed BIT NOT NULL DEFAULT(0),
        Time_Group NVARCHAR(20) NOT NULL
      );
      CREATE INDEX IX_Daily_Task_Day_TimeGroup ON dbo.Daily_Task(Day, Time_Group);
    END
  `);
  await db.query(`
    IF OBJECT_ID(N'dbo.Inviter', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Inviter (
        Inviter_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        Baby_name NVARCHAR(100) NULL,
        Baby_age NVARCHAR(20) NULL,
        Baby_alimentation NVARCHAR(200) NULL,
        Baby_sleep_cycle NVARCHAR(200) NULL,
        Baby_bath_cycle NVARCHAR(200) NULL,
        Baby_eay_cycle NVARCHAR(200) NULL,
        Is_baby_taking_medecine BIT NOT NULL DEFAULT(0),
        Is_baby_consulting_doctor BIT NOT NULL DEFAULT(0)
      );
    END
  `);
}

getDb().then(async (db) => {
  await db.query('SELECT 1');
  await ensureSchema(db);
  console.log('✅ MSSQL ready');
}).catch((err) => {
  console.error('❌ MSSQL connection error', err);
  process.exit(1);
});

async function registerPlugins() {
  try {
    // 1. CORS Configuration - Most permissive for development
    await app.register(require('@fastify/cors'), {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'X-App-Version'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      preflightContinue: false,
      optionsSuccessStatus: 204
    });

    // 2. Serve Static Images with Caching
    // Use specific prefix to avoid route conflicts with API
    await app.register(require('@fastify/static'), {
      root: path.join(__dirname, 'public/images'),
      prefix: '/images/',
      decorateReply: false,
      maxAge: 31536000000, // 1 year cache
      immutable: true
    });

    // 3. Security & Utility Plugins - Disable ALL helmet CORS features
    await app.register(require('@fastify/helmet'), {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: false // Disable HSTS for local development
    });
    /* 
    await app.register(require('@fastify/compress'), {
      threshold: 1024, // Compress responses > 1KB
      encodings: ['gzip', 'deflate'],
      zlibOptions: {
        level: 6 // Balance between speed and compression (1-9)
      }
    });
    */
    await app.register(require('@fastify/jwt'), {
      secret: process.env.JWT_SECRET
    });

    // 4. Rate Limiting & Auth
await app.register(
  require('@fastify/rate-limit'),
  {
    ...require('./middleware/rateLimiter').rateLimitConfig.global,
    skip: (request) => {
      // Skip rate limiting for static images
      return request.url.startsWith('/images/');
    }
  }
);
    
    app.decorate('authenticate', async (request, reply) => {
      const { authenticateToken } = require('./middleware/auth');
      await authenticateToken(request, reply);
    });

    await app.register(require('@fastify/auth'));

    app.log.info('✅ All plugins registered successfully');
  } catch (err) {
    console.error('❌ Error registering plugins:', err);
    process.exit(1);
  }
}

(async () => {
  try {
    await registerPlugins();

    // Health check route
    app.get('/api/health', async () => ({
      message: 'API Baby shop - Backend opérationnel (Fastify)',
      status: 'running'
    }));

    // Register Routes - Baby Products & Articles Marketplace
    await app.register(require('./routes/productRoutes'), { prefix: '/api/products' });
    await app.register(require('./routes/categoryRoutes'), { prefix: '/api/categories' });
    await app.register(require('./routes/articleRoutes'), { prefix: '/api/articles' });
    
    await app.register(require('./routes/authRoutes'), { prefix: '/api/auth' });
    await app.register(require('./routes/userRoutes'), { prefix: '/api/users' });
    await app.register(require('./routes/commandeRoutes'), { prefix: '/api/commandes' });
    await app.register(require('./routes/factureRoutes'), { prefix: '/api/factures' });
    await app.register(require('./routes/messageRoutes'), { prefix: '/api/messages' });
    await app.register(require('./routes/imageRoutes'), { prefix: '/api/image' });
    await app.register(require('./routes/inviterRoutes'), { prefix: '/api/inviter' });
    await app.register(require('./routes/dailyTaskRoutes'), { prefix: '/api/daily-tasks' });

    console.log('✅ All routes registered');

    app.setNotFoundHandler((request, reply) => {
      reply.code(404).send({ success: false, message: 'Route API non trouvée' });
    });

    app.setErrorHandler((error, request, reply) => {
      app.log.error(error);
      reply.code(error.statusCode || 500).send({
        success: false,
        message: error.message || 'Erreur serveur'
      });
    });

    // Start server on 0.0.0.0 
    const PORT = process.env.PORT || 5000;
    await app.listen({ port: PORT, host: '0.0.0.0' });

    console.log(`🚀 Serveur Fastify démarré sur le port ${PORT}`);
  } catch (err) {
    console.error('❌ Fatal error starting server:', err);
    process.exit(1);
  }
})();

// Graceful shutdown logic
const closeGracefully = async (signal) => {
  try {
    console.log(`\n⏹️ Received ${signal}, closing gracefully...`);
    await app.close();
    const { closePool } = require('./config/sql');
    await closePool();
    console.log('👋 Server closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during graceful shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', closeGracefully);
process.on('SIGINT', closeGracefully);
