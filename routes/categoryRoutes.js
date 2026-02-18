// routes/categoryRoutes.js - Routes pour les catégories de produits
const Category = require('../models/Category');
const Product = require('../models/Product');
const { getDb } = require('../config/sql');

async function categoryRoutes(fastify, options) {
  
  // GET /api/categories - Liste toutes les catégories
  fastify.get('/', async (request, reply) => {
    try {
      const db = await getDb();
      const res = await db.query(`
        SELECT 
          c.CategoryId AS _id,
          c.Name AS name,
          c.Slug AS slug,
          c.Description AS description,
          c.Icon AS icon,
          c.DisplayOrder AS displayOrder,
          c.IsActive AS isActive,
          ISNULL(pc.ProductCount, 0) AS productCount
        FROM dbo.Categories c
        LEFT JOIN (
          SELECT CategoryId, COUNT(*) AS ProductCount
          FROM dbo.Products
          WHERE IsActive = 1
          GROUP BY CategoryId
        ) pc ON pc.CategoryId = c.CategoryId
        WHERE c.IsActive = 1
        ORDER BY c.DisplayOrder ASC
      `);
      return { success: true, data: res };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: "Erreur lors du chargement des catégories" });
    }
  });

  // GET /api/categories/:id - Une catégorie par ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = await getDb();
      const catRes = await db.query(`
          SELECT 
            c.CategoryId AS _id,
            c.Name AS name,
            c.Slug AS slug,
            c.Description AS description,
            c.Icon AS icon,
            c.DisplayOrder AS displayOrder,
            c.IsActive AS isActive
          FROM dbo.Categories c
          WHERE c.IsActive = 1 AND c.CategoryId = ?
        `, [parseInt(id, 10)]);
      if (catRes.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
      }

      const countRes = await db.query(`
          SELECT COUNT(*) AS cnt
          FROM dbo.Products
          WHERE IsActive = 1 AND CategoryId = ?
        `, [parseInt(id, 10)]);

      reply.send({
        success: true,
        data: {
          ...catRes[0],
          productCount: countRes[0]?.cnt || 0
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la catégorie'
      });
    }
  });

  // GET /api/categories/slug/:slug - Catégorie par slug
  fastify.get('/slug/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;

      const category = await Category.findOne({ slug, isActive: true });

      if (!category) {
        return reply.code(404).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
      }

      const productCount = await Product.countDocuments({
        categoryId: category._id,
        isActive: true
      });

      reply.send({
        success: true,
        data: {
          ...category.toObject(),
          productCount
        }
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la catégorie'
      });
    }
  });

  // GET /api/categories/:id/products - Produits d'une catégorie
  fastify.get('/:id/products', async (request, reply) => {
    try {
      const { id } = request.params;
      const { page = 1, limit = 20 } = request.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const db = await getDb();
      const catRes = await db.query(`
          SELECT 
            c.CategoryId AS _id,
            c.Name AS name,
            c.Slug AS slug,
            c.Description AS description,
            c.Icon AS icon,
            c.DisplayOrder AS displayOrder,
            c.IsActive AS isActive
          FROM dbo.Categories c
          WHERE c.IsActive = 1 AND c.CategoryId = ?
        `, [parseInt(id, 10)]);
      if (catRes.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
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
            p.IsFeatured AS isFeatured
          FROM dbo.Products p
          WHERE p.IsActive = 1 AND p.CategoryId = ?
          ORDER BY p.ProductId DESC
          OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        `, [parseInt(id, 10), offset, parseInt(limit, 10)]);

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
        ...p,
        images: imagesMap[p._id] || [],
        categoryId: {
          name: catRes[0].name,
          slug: catRes[0].slug,
          icon: catRes[0].icon
        }
      }));

      const totalRes = await db.query(`
          SELECT COUNT(*) AS total
          FROM dbo.Products
          WHERE IsActive = 1 AND CategoryId = ?
        `, [parseInt(id, 10)]);
      const total = totalRes[0]?.total || 0;

      reply.send({
        success: true,
        category: catRes[0],
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

  // POST /api/categories - Créer une catégorie (admin)
  fastify.post('/', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const categoryData = request.body;

      const category = new Category(categoryData);
      await category.save();

      reply.code(201).send({
        success: true,
        message: 'Catégorie créée avec succès',
        data: category
      });
    } catch (error) {
      fastify.log.error(error);
      
      if (error.code === 11000) {
        return reply.code(400).send({
          success: false,
          message: 'Une catégorie avec ce nom ou slug existe déjà'
        });
      }

      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la création de la catégorie'
      });
    }
  });

  // PUT /api/categories/:id - Modifier une catégorie (admin)
  fastify.put('/:id', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;

      const category = await Category.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!category) {
        return reply.code(404).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
      }

      reply.send({
        success: true,
        message: 'Catégorie modifiée avec succès',
        data: category
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la modification de la catégorie'
      });
    }
  });

  // DELETE /api/categories/:id - Supprimer une catégorie (admin)
  fastify.delete('/:id', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Vérifier s'il y a des produits dans cette catégorie
      const productCount = await Product.countDocuments({
        categoryId: id,
        isActive: true
      });

      if (productCount > 0) {
        return reply.code(400).send({
          success: false,
          message: `Impossible de supprimer cette catégorie. ${productCount} produit(s) y sont associés.`
        });
      }

      // Soft delete: désactiver la catégorie
      const category = await Category.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      );

      if (!category) {
        return reply.code(404).send({
          success: false,
          message: 'Catégorie non trouvée'
        });
      }

      reply.send({
        success: true,
        message: 'Catégorie supprimée avec succès'
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la suppression de la catégorie'
      });
    }
  });
}

module.exports = categoryRoutes;
