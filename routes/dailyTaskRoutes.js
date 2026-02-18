const { getDb } = require('../config/sql');

function groupForIndex(i) {
  if (i === 0) return 'Morning';
  if (i === 1) return 'Day';
  if (i === 2) return 'Afternoon';
  return 'Night';
}

async function dailyTaskRoutes(fastify, options) {
  fastify.get('/', async (request, reply) => {
    try {
      const { day } = request.query;
      const db = await getDb();
      const dayStr = (day && typeof day === 'string') ? day : new Date().toISOString().slice(0, 10);
      const res = await db.query(`
        SELECT 
          TaskId = dt.Id,
          dt.Day,
          dt.Task,
          dt.Task_Is_Completed,
          dt.Time_Group
        FROM dbo.Daily_Task dt
        WHERE dt.Day = ?
        ORDER BY dt.Time_Group ASC, dt.Task ASC
      `, [dayStr]);
      return { success: true, data: res };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors du chargement des tâches',
        error: error.message
      });
    }
  });

  fastify.put('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { task_is_completed } = request.body || {};
      const db = await getDb();
      await db.query(`
        UPDATE dbo.Daily_Task
        SET Task_Is_Completed = ?
        WHERE Id = ?
      `, [!!task_is_completed, parseInt(id, 10)]);
      const exists = await db.query(`
        SELECT 1 FROM dbo.Daily_Task WHERE Id = ?
      `, [parseInt(id, 10)]);
      if (exists.length === 0) {
        return reply.code(404).send({ success: false, message: 'Tâche non trouvée' });
      }
      return { success: true };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors de la mise à jour de la tâche',
        error: error.message
      });
    }
  });

  fastify.post('/generate', async (request, reply) => {
    try {
      const { inviterId, day } = request.body || {};
      if (!inviterId) {
        return reply.code(400).send({ success: false, message: 'inviterId requis' });
      }
      const db = await getDb();

      const colCheck = await db.query(`
        SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Inviter') AND name IN ('Baby_eay_cycle','Baby_eat_cycle')
      `);
      const colNames = (colCheck || []).map(r => r.name);
      const mealsCol = colNames.includes('Baby_eay_cycle') ? 'Baby_eay_cycle' : (colNames.includes('Baby_eat_cycle') ? 'Baby_eat_cycle' : null);
      if (!mealsCol) {
        return reply.code(500).send({ success: false, message: 'Colonne de cycle repas introuvable' });
      }
      const iRes = await db.query(`
          SELECT 
            ${mealsCol} AS meals,
            Is_baby_taking_medecine
          FROM dbo.Inviter
          WHERE Inviter_id = ?
        `, [inviterId]);
      if (iRes.length === 0) {
        return reply.code(404).send({ success: false, message: 'Inviter non trouvé' });
      }
      const info = iRes[0];
      const meals = parseInt(info.meals || '4', 10);
      const dayStr = (day && typeof day === 'string') ? day : new Date().toISOString().slice(0, 10);

      const tasks = [];
      tasks.push({ task: 'Petit déjeuner', group: 'Morning' });
      for (let i = 0; i < meals; i++) {
        tasks.push({ task: 'Faire manger bébé', group: groupForIndex(i) });
      }
      if (info.Is_baby_taking_medecine) {
        tasks.push({ task: 'Prendre les médicaments', group: 'Day' });
      }
      tasks.push({ task: 'Jouer avec bébé', group: 'Afternoon' });
      tasks.push({ task: 'Dîner', group: 'Night' });
      tasks.push({ task: 'Dodo', group: 'Night' });

      await db.query(`DELETE FROM dbo.Daily_Task WHERE Day = ?`, [dayStr]);
      let inserted = 0;
      for (const t of tasks) {
        await db.query(
          `INSERT INTO dbo.Daily_Task (Day, Task, Task_Is_Completed, Time_Group) VALUES (?, ?, 0, ?)`,
          [dayStr, t.task, t.group]
        );
        inserted++;
      }

      return { success: true, count: inserted };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors de la génération des tâches',
        error: error.message
      });
    }
  });
}

module.exports = dailyTaskRoutes;
