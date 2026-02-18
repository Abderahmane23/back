const Anthropic = require('@anthropic-ai/sdk');
const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

async function imageRoutes(fastify, options) {
  
  // GET /api/image - List all available images in public/images/products
  fastify.get('/', async (request, reply) => {
    try {
      const imagesDir = path.join(__dirname, '../public/images/products');
      if (!fs.existsSync(imagesDir)) {
        return { success: true, images: [] };
      }
      const files = fs.readdirSync(imagesDir);
      const images = files.filter(file => 
        ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(path.extname(file).toLowerCase())
      ).map(file => `/images/products/${file}`);
      
      return { success: true, count: images.length, images };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: "Erreur lors de la lecture des images" });
    }
  });

  fastify.post('/analyze', async (request, reply) => {
    try {
      let { image } = request.body;
      if (!image) return reply.code(400).send({ success: false, message: 'Image requise' });

      if (image.includes('base64,')) image = image.split('base64,')[1];

      // 1. ANALYSE UNIVERSELLE (Claude identifie la pièce peu importe la marque)
      const analysisResult = await analyzeImageWithClaude(image);

      // 2. MATCHING FLEXIBLE (Trouver le plus proche dans la DB actuelle)
      const matchedProducts = await internalFindMatchingProducts(analysisResult, request);

      return { 
        success: true, 
        analysis: analysisResult, 
        matchedProducts 
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: "Erreur d'analyse", error: error.message });
    }
  });

  // ==========================================
  // IA : Identification et Orientation
  // ==========================================
  async function analyzeImageWithClaude(base64Image) {
    // If no API key, return a graceful fallback instead of throwing
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        partNameEn: null,
        partNameFr: null,
        description: 'Analyse IA indisponible pour le moment.',
        'part-location': null,
        'Replacement-guide': null,
        brandDetected: null,
        vehicleType: null,
        serialNumber: null,
        keywords: []
      };
    }

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            {
              type: 'text',
              text: `Tu es un expert en pièces détachées multi-marques (Poids lourds, utilitaires, voitures).
              1. Identifie la pièce sur l'image.
              2. Cherche une marque ou un numéro de série sur la pièce.
              3. Donne une description courte et un guide de changement comme indiquer ci-dessous.
              
              Réponds en JSON strict :
              {
                "partNameEn": "Nom technique anglais (ex: Alternator)",
                "partNameFr": "Nom technique français (ex: Alternateur)",
                
                "description": "Explique à quoi sert cette pièce et comment vérifier son état.",
                "part-location": "Explique Où se situe la pièce dans le véhicule.",
                "Replacement-guide": "Explique comment changer la pièce.",
                "brandDetected": "Marque détectée sur l'image ou null",
                "vehicleType": "Catégorie (ex: Camion, Voiture, Engin)",
                "serialNumber": "Code extrait ou null",
                "keywords": ["mots", "clés", "recherche"]
              }`
            }
          ]
        }]
      });
      const text = message.content?.[0]?.text || '{}';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return {
          partNameEn: null,
          partNameFr: null,
          description: 'Analyse IA non concluante.',
          'part-location': null,
          'Replacement-guide': null,
          brandDetected: null,
          vehicleType: null,
          serialNumber: null,
          keywords: []
        };
      }
      return JSON.parse(match[0]);
    } catch (e) {
      return {
        partNameEn: null,
        partNameFr: null,
        description: 'Analyse IA échouée.',
        'part-location': null,
        'Replacement-guide': null,
        brandDetected: null,
        vehicleType: null,
        serialNumber: null,
        keywords: []
      };
    }
  }

  // ==========================================
  // RAG : Recherche de similarité en base
  // ==========================================
  async function internalFindMatchingProducts(analysis, request) {
    const { partNameEn, partNameFr, brandDetected, serialNumber, keywords } = analysis;

    // Création d'un "poids" de mots-clés - with null checks
    const tokens = new Set();
    
    // Add English part name tokens
    if (partNameEn && typeof partNameEn === 'string') {
      partNameEn.toLowerCase().split(' ').forEach(token => tokens.add(token));
    }
    
    // Add French part name tokens
    if (partNameFr && typeof partNameFr === 'string') {
      partNameFr.toLowerCase().split(' ').forEach(token => tokens.add(token));
    }
    
    // Add keywords
    if (keywords && Array.isArray(keywords)) {
      keywords.forEach(k => {
        if (k && typeof k === 'string') tokens.add(k.toLowerCase());
      });
    }
    
    // Si une marque est vue sur l'image, on l'ajoute en priorité
    if (brandDetected && typeof brandDetected === 'string') {
      tokens.add(brandDetected.toLowerCase());
    }
    
    if (serialNumber && typeof serialNumber === 'string') {
      tokens.add(serialNumber.toLowerCase());
    }

    const finalTokens = Array.from(tokens).filter(t => t && t.length > 2);
    if (finalTokens.length === 0) return [];

    // Recherche très large (OR) pour ne rien rater
    const queryRegex = finalTokens.map(t => new RegExp(t, 'i'));

    const potentialMatches = await Product.find({
      $or: [
        { name: { $in: queryRegex } },
        { sku: { $in: queryRegex } },
        { description: { $in: queryRegex } }
      ]
    }).limit(15);

    // Scoring dynamique
    const scored = potentialMatches.map(product => {
      const pName = (product.name || '').toLowerCase();
      let score = 0;

      finalTokens.forEach(token => {
        // Bonus si le mot est dans le nom du produit
        if (pName.includes(token)) score += 2;
        // Bonus si c'est la marque détectée - SAFE CHECK
        if (brandDetected && typeof brandDetected === 'string' && 
            pName.includes(brandDetected.toLowerCase())) {
          score += 5;
        }
        // Bonus ultime pour le numéro de série - SAFE CHECK
        if (serialNumber && typeof serialNumber === 'string' && 
            pName.includes(serialNumber.toLowerCase())) {
          score += 10;
        }
      });

      // In development, hardcode localhost:5000. In production, use dynamic URL
      const baseUrl = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:5000'
        : `${request.protocol || 'https'}://${request.headers.host || request.hostname}`;
      
      return {
        ...product.toObject(),
        similarityScore: score,
        prix: product.price,
        stock: product.stock,
        image_url: product.images && product.images.length > 0
          ? `${baseUrl}/images/products/${product.images[0]}` 
          : null
      };
    });

    // On trie par score et on renvoie même si le match n'est pas parfait
    return scored
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 5); 
  }
}

module.exports = imageRoutes;
