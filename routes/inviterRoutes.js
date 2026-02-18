const { getDb, sql } = require('../config/sql');
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

async function inviterRoutes(fastify, options) {
  fastify.post('/', async (request, reply) => {
    try {
      const body = request.body || {};
      const inviterId = body.Inviter_id || generateId();
      const db = await getDb();

      const columns = [
        'Inviter_id',
        'Baby_name',
        'Baby_age',
        'Baby_alimentation',
        'Baby_sleep_cycle',
        'Baby_bath_cycle',
        'Baby_eay_cycle',
        'Is_baby_taking_medecine',
        'Is_baby_consulting_doctor'
      ];

      const values = columns.map((c) => body[c]);

      await db.query(`
        INSERT INTO dbo.Inviter (
          Inviter_id, Baby_name, Baby_age, Baby_alimentation, Baby_sleep_cycle,
          Baby_bath_cycle, Baby_eay_cycle, Is_baby_taking_medecine, Is_baby_consulting_doctor
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        inviterId,
        body.Baby_name || null,
        body.Baby_age || null,
        body.Baby_alimentation || null,
        body.Baby_sleep_cycle || null,
        body.Baby_bath_cycle || null,
        body.Baby_eay_cycle || null,
        !!body.Is_baby_taking_medecine,
        !!body.Is_baby_consulting_doctor
      ]);

      return reply.code(201).send({
        success: true,
        data: { Inviter_id: inviterId }
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors de la création de l\'Inviter',
        error: error.message
      });
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body || {};
      const db = await getDb();

      const fields = [
        'Baby_name',
        'Baby_age',
        'Baby_alimentation',
        'Baby_sleep_cycle',
        'Baby_bath_cycle',
        'Baby_eay_cycle',
        'Is_baby_taking_medecine',
        'Is_baby_consulting_doctor'
      ].filter((f) => typeof body[f] !== 'undefined');

      if (fields.length === 0) {
        return reply.code(400).send({ success: false, message: 'Aucun champ à mettre à jour' });
      }

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const params = fields.map((f) => body[f]);
      params.push(id);
      await db.query(`
        UPDATE dbo.Inviter SET ${setClauses} WHERE Inviter_id = ?
      `, params);
      const exists = await db.query(`
        SELECT 1 FROM dbo.Inviter WHERE Inviter_id = ?
      `, [id]);
      if (exists.length === 0) {
        return reply.code(404).send({ success: false, message: 'Inviter non trouvé' });
      }

      return { success: true };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors de la mise à jour de l\'Inviter',
        error: error.message
      });
    }
  });
}

module.exports = inviterRoutes;
