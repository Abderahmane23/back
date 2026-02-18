const { getDb } = require('../config/sql');

async function articleRoutes(fastify, options) {
  fastify.get('/', async (request, reply) => {
    try {
      const { page = 1, limit = 20, tag } = request.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const db = await getDb();
      let where = 'a.IsPublished = 1';
      const params = [];
      if (tag) {
        where += ' AND a.Tags LIKE ?';
        params.push(`%${tag}%`);
      }
      const rows = await db.query(`
        SELECT 
          a.ArticleId AS _id,
          a.Title AS title,
          a.Slug AS slug,
          a.Summary AS summary,
          a.CoverImage AS coverImage,
          a.AgeGroup AS ageGroup,
          a.DisplayOrder,
          a.IsPublished,
          a.ViewCount
        FROM dbo.Articles a
        WHERE ${where}
        ORDER BY a.DisplayOrder ASC, a.ArticleId DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
      `, [...params, offset, parseInt(limit, 10)]);
      const totalRows = await db.query(`
        SELECT COUNT(*) AS total
        FROM dbo.Articles a
        WHERE ${where}
      `, params);
      reply.send({
        success: true,
        data: rows || [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: totalRows[0]?.total || 0,
          pages: Math.ceil((totalRows[0]?.total || 0) / parseInt(limit, 10))
        }
      });
    } catch (error) {
      reply.code(200).send({
        success: true,
        data: [],
        pagination: {
          page: parseInt(request.query.page || 1, 10),
          limit: parseInt(request.query.limit || 20, 10),
          total: 0,
          pages: 0
        }
      });
    }
  });

  fastify.get('/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;
      const db = await getDb();
      const rows = await db.query(`
        SELECT 
          a.ArticleId AS _id,
          a.Title AS title,
          a.Slug AS slug,
          a.Summary AS summary,
          a.CoverImage AS coverImage,
          a.AgeGroup AS ageGroup,
          a.ViewCount
        FROM dbo.Articles a
        WHERE a.IsPublished = 1 AND a.Slug = ?
      `, [slug]);
      if (rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Article non trouvé' });
      }
      reply.send({ success: true, data: rows[0] });
    } catch (error) {
      reply.code(404).send({ success: false, message: 'Article non trouvé' });
    }
  });

  fastify.get('/:id/products', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = await getDb();
      const article = await db.query(`
        SELECT ArticleId AS _id, Title AS title, Slug AS slug
        FROM dbo.Articles
        WHERE ArticleId = ?
      `, [parseInt(id, 10)]);
      if (article.length === 0) {
        return reply.code(404).send({ success: false, message: 'Article non trouvé' });
      }
      reply.send({ success: true, article: article[0], data: [] });
    } catch (error) {
      reply.send({ success: true, article: null, data: [] });
    }
  });

  fastify.put('/:id/view', async (request, reply) => {
    try {
      const { id } = request.params;
      const db = await getDb();
      await db.query(`
        UPDATE dbo.Articles SET ViewCount = ISNULL(ViewCount, 0) + 1
        WHERE ArticleId = ?
      `, [parseInt(id, 10)]);
      const rows = await db.query(`
        SELECT ViewCount FROM dbo.Articles WHERE ArticleId = ?
      `, [parseInt(id, 10)]);
      if (rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Article non trouvé' });
      }
      reply.send({ success: true, viewCount: rows[0].ViewCount || 0 });
    } catch (error) {
      reply.send({ success: true, viewCount: 0 });
    }
  });

  fastify.get('/tag/:tag', async (request, reply) => {
    try {
      const { tag } = request.params;
      const { page = 1, limit = 20 } = request.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const db = await getDb();
      const rows = await db.query(`
        SELECT 
          a.ArticleId AS _id,
          a.Title AS title,
          a.Slug AS slug,
          a.Summary AS summary,
          a.CoverImage AS coverImage,
          a.AgeGroup AS ageGroup
        FROM dbo.Articles a
        WHERE a.IsPublished = 1 AND a.Tags LIKE ?
        ORDER BY a.ArticleId DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
      `, [`%${tag}%`, offset, parseInt(limit, 10)]);
      const totalRows = await db.query(`
        SELECT COUNT(*) AS total
        FROM dbo.Articles a
        WHERE a.IsPublished = 1 AND a.Tags LIKE ?
      `, [`%${tag}%`]);
      reply.send({
        success: true,
        tag,
        data: rows || [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: totalRows[0]?.total || 0,
          pages: Math.ceil((totalRows[0]?.total || 0) / parseInt(limit, 10))
        }
      });
    } catch (error) {
      reply.send({
        success: true,
        tag,
        data: [],
        pagination: {
          page: parseInt(request.query.page || 1, 10),
          limit: parseInt(request.query.limit || 20, 10),
          total: 0,
          pages: 0
        }
      });
    }
  });
}

module.exports = articleRoutes;
