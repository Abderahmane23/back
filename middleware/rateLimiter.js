// middleware/rateLimiter.js

/**
 * Configuration du rate limiting pour Fastify
 * @fastify/rate-limit
 */

const rateLimitConfig = {
  // Configuration globale
  global: {
    max: 1000, // Augmenter en dev si activé par erreur
    timeWindow: '15 minutes', // par 15 minutes
    ban: 3, // Bannir après 3 dépassements
    cache: 10000, // Cache 10k IP
    allowList: ['127.0.0.1', '::1', 'localhost'], // IPs whitelistées
    enabled: process.env.NODE_ENV !== 'development', // Désactiver en dev
    redis: null, // Optionnel: utiliser Redis pour cluster
    skipOnError: true, // Ne pas bloquer si erreur
    onBanReach: (req, key) => {
      console.warn(`IP ${key} bannie temporairement`);
    },
    keyGenerator: (request) => {
      // Utiliser l'IP réelle derrière le proxy
      return request.headers['x-forwarded-for'] || 
             request.headers['x-real-ip'] || 
             request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        message: 'Trop de requêtes. Veuillez réessayer plus tard.',
        statusCode: 429,
        error: 'Too Many Requests',
        retryAfter: context.ttl
      };
    }
  },

  // Configuration pour les routes d'authentification (plus strict)
  auth: {
    max: 5, // 5 tentatives
    timeWindow: '15 minutes',
    ban: 2
  },

  // Configuration pour les uploads (très strict)
  upload: {
    max: 10, // 10 uploads
    timeWindow: '1 hour',
    ban: 1
  },

  // Configuration pour les lectures (plus permissif)
  read: {
    max: 200, // 200 requêtes
    timeWindow: '15 minutes'
  }
};

/**
 * Créer une configuration de rate limit personnalisée
 */
function createRateLimiter(type = 'global') {
  const config = rateLimitConfig[type] || rateLimitConfig.global;
  
  return {
    ...rateLimitConfig.global,
    ...config
  };
}

module.exports = {
  rateLimitConfig,
  createRateLimiter
};