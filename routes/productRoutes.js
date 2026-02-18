// routes/productRoutes.js - Routes pour les produits pour bébés
const Product = require('../models/Product');
const Category = require('../models/Category');
const { getDb } = require('../config/sql');

async function productRoutes(fastify, options) {
  
  // GET /api/products - Liste tous les produits (paginés)
  fastify.get('/', async (request, reply) => {
    try {
      const { page = 1, limit = 20, categoryId, featured } = request.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const db = await getDb();

      let where = 'p.IsActive = 1';
      const params = [];
      if (categoryId) {
        where += ' AND p.CategoryId = ?';
        params.push(parseInt(categoryId, 10));
      }
      if (featured === 'true') {
        where += ' AND p.IsFeatured = 1';
      }

      const listRes = await db.query(`
          SELECT 
            p.ProductId AS _id,
            p.Name AS name,
            p.Slug AS slug,
            p.Description AS description,
            p.Brand AS brand,
            p.Price AS price,
            p.Currency AS currency,
            p.Stock AS stock,
            p.Rating AS rating,
            p.IsActive AS isActive,
            p.IsFeatured AS isFeatured,
            c.Name AS categoryName,
            c.Slug AS categorySlug,
            c.Icon AS categoryIcon
          FROM dbo.Products p
          LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
          WHERE ${where}
          ORDER BY p.ProductId DESC
          OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        `, [...params, offset, parseInt(limit, 10)]);

      const ids = listRes.map(r => r._id);
      let imagesMap = {};
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const imgRes = await db.query(`
          SELECT ProductId, ImagePath, DisplayOrder
          FROM dbo.ProductImages
          WHERE ProductId IN (${placeholders})
          ORDER BY DisplayOrder ASC
        `, ids);
        imagesMap = imgRes.reduce((acc, row) => {
          acc[row.ProductId] = acc[row.ProductId] || [];
          acc[row.ProductId].push(row.ImagePath);
          return acc;
        }, {});
      }

      const data = listRes.map(p => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        brand: p.brand,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        rating: p.rating,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
        images: imagesMap[p._id] || [],
        categoryId: {
          name: p.categoryName,
          slug: p.categorySlug,
          icon: p.categoryIcon
        }
      }));

      const totalRes = await db.query(`
        SELECT COUNT(*) AS total
        FROM dbo.Products p
        WHERE ${where}
      `);
      const total = totalRes[0]?.total || 0;

      reply.send({
        success: true,
        data,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération des produits'
      });
    }
  });

  // GET /api/products/search - Rechercher des produits
  fastify.get('/search', async (request, reply) => {
    try {
      const { q } = request.query;
      
      if (!q) {
        return reply.code(400).send({
          success: false,
          message: 'Le paramètre de recherche "q" est requis'
        });
      }

      const db = await getDb();
      const listRes = await db.query(`
          SELECT TOP 20
            p.ProductId AS _id,
            p.Name AS name,
            p.Slug AS slug,
            p.Description AS description,
            p.Brand AS brand,
            p.Price AS price,
            p.Currency AS currency,
            p.Stock AS stock,
            p.Rating AS rating,
            c.Name AS categoryName,
            c.Slug AS categorySlug,
            c.Icon AS categoryIcon
          FROM dbo.Products p
          LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
          WHERE p.IsActive = 1 AND (p.Name LIKE ? OR p.Description LIKE ?)
          ORDER BY p.ProductId DESC
        `, [`%${q}%`, `%${q}%`]);

      const ids = listRes.map(r => r._id);
      let imagesMap = {};
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const imgRes = await db.query(`
          SELECT ProductId, ImagePath, DisplayOrder
          FROM dbo.ProductImages
          WHERE ProductId IN (${placeholders})
          ORDER BY DisplayOrder ASC
        `, ids);
        imagesMap = imgRes.reduce((acc, row) => {
          acc[row.ProductId] = acc[row.ProductId] || [];
          acc[row.ProductId].push(row.ImagePath);
          return acc;
        }, {});
      }

      const data = listRes.map(p => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        brand: p.brand,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        rating: p.rating,
        images: imagesMap[p._id] || [],
        categoryId: {
          name: p.categoryName,
          slug: p.categorySlug,
          icon: p.categoryIcon
        }
      }));

      reply.send({
        success: true,
        data,
        count: data.length
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la recherche'
      });
    }
  });

  // GET /api/products/category/:categoryId - Produits par catégorie
  fastify.get('/category/:categoryId', async (request, reply) => {
    try {
      const { categoryId } = request.params;
      const { page = 1, limit = 20 } = request.query;
      const skip = (page - 1) * limit;

      const products = await Product.find({ 
        categoryId, 
        isActive: true 
      })
      .populate('categoryId', 'name slug icon')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

      const total = await Product.countDocuments({ 
        categoryId, 
        isActive: true 
      });

      reply.send({
        success: true,
        data: products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération des produits de la catégorie'
      });
    }
  });

  // GET /api/products/slug/:slug - Produit par slug
  fastify.get('/slug/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;
      const db = await getDb();
      const res = await db.query(`
          SELECT 
            p.ProductId AS _id,
            p.Name AS name,
            p.Slug AS slug,
            p.Description AS description,
            p.Brand AS brand,
            p.Price AS price,
            p.Currency AS currency,
            p.Stock AS stock,
            p.Rating AS rating,
            c.Name AS categoryName,
            c.Slug AS categorySlug,
            c.Icon AS categoryIcon
          FROM dbo.Products p
          LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
          WHERE p.IsActive = 1 AND p.Slug = ?
        `, [slug]);
      if (res.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Produit non trouvé'
        });
      }

      const p = res[0];
      const imgRes = await db.query(`
        SELECT ImagePath
        FROM dbo.ProductImages
        WHERE ProductId = ?
        ORDER BY DisplayOrder ASC
      `, [p._id]);
      const images = imgRes.map(r => r.ImagePath);
      const product = {
        _id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        brand: p.brand,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        rating: p.rating,
        images,
        categoryId: {
          name: p.categoryName,
          slug: p.categorySlug,
          icon: p.categoryIcon
        }
      };

      reply.send({
        success: true,
        data: product
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération du produit'
      });
    }
  });

  // GET /api/products/:id - Produit par ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = await getDb();
      const res = await db.query(`
          SELECT 
            p.ProductId AS _id,
            p.Name AS name,
            p.Slug AS slug,
            p.Description AS description,
            p.Brand AS brand,
            p.Price AS price,
            p.Currency AS currency,
            p.Stock AS stock,
            p.Rating AS rating,
            c.Name AS categoryName,
            c.Slug AS categorySlug,
            c.Icon AS categoryIcon
          FROM dbo.Products p
          LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
          WHERE p.IsActive = 1 AND p.ProductId = ?
        `, [parseInt(id, 10)]);
      if (res.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Produit non trouvé'
        });
      }

      const p = res[0];
      const imgRes = await getDb().then(db2 => db2.query(`
        SELECT ImagePath
        FROM dbo.ProductImages
        WHERE ProductId = ?
        ORDER BY DisplayOrder ASC
      `, [p._id]));
      const images = imgRes.map(r => r.ImagePath);
      const product = {
        _id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        brand: p.brand,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        rating: p.rating,
        images,
        categoryId: {
          name: p.categoryName,
          slug: p.categorySlug,
          icon: p.categoryIcon
        }
      };

      reply.send({
        success: true,
        data: product
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération du produit'
      });
    }
  });

  // POST /api/products - Créer un produit (admin)
  fastify.post('/', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const productData = request.body;
      
      // Vérifier que la catégorie existe
      const category = await Category.findById(productData.categoryId);
      if (!category) {
        return reply.code(400).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
      }

      const product = new Product(productData);
      await product.save();

      reply.code(201).send({
        success: true,
        message: 'Produit créé avec succès',
        data: product
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la création du produit'
      });
    }
  });

  // PUT /api/products/:id - Modifier un produit (admin)
  fastify.put('/:id', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;

      const product = await Product.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('categoryId', 'name slug icon');

      if (!product) {
        return reply.code(404).send({
          success: false,
          message: 'Produit non trouvé'
        });
      }

      reply.send({
        success: true,
        message: 'Produit modifié avec succès',
        data: product
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la modification du produit'
      });
    }
  });

  // DELETE /api/products/:id - Supprimer un produit (admin)
  fastify.delete('/:id', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Soft delete: désactiver le produit au lieu de le supprimer
      const product = await Product.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      );

      if (!product) {
        return reply.code(404).send({
          success: false,
          message: 'Produit non trouvé'
        });
      }

      reply.send({
        success: true,
        message: 'Produit supprimé avec succès'
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la suppression du produit'
      });
    }
  });
}

module.exports = productRoutes;
