// routes/usuarioDetalle.js

/*
Ficha completa de usuarios.

Montaje en index.js (junto al router de usuarios que ya existe):
app.use('/api/usuarios', require('./routes/usuarioDetalle'));

Este router solo agrega GET /:id; no interfiere con GET / ni con PATCH /:id/rol.
*/

const express = require('express');
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const soloAdmin = require('../middleware/adminAuth');

const router = express.Router();

const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

router.get('/:id', verificarToken, soloAdmin, async (req, res) => {
  // Se valida a mano porque Express 5 ya no admite expresiones regulares en los parámetros de ruta
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Id de usuario no válido' });
  }

  try {
    // Nunca se selecciona contrasena_hash
    const usuario = await pool.query(
      `SELECT id, nombre, apellido, email, rol, disponible, fecha_creacion
       FROM usuario WHERE id = $1`,
      [id]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const [creadas, atendidas, recientesCreadas, recientesAtendidas, dispositivos] = await Promise.all([
      // Solicitudes que el usuario ha creado
      pool.query(
        `SELECT COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE estado = 'pendiente'))::int AS pendientes,
                (COUNT(*) FILTER (WHERE estado = 'atendida'))::int AS atendidas,
                (COUNT(*) FILTER (WHERE estado = 'terminada'))::int AS terminadas
         FROM solicitud WHERE usuario_id = $1`,
        [id]
      ),
      // Solicitudes que el usuario ha atendido (personal de soporte)
      pool.query(
        `SELECT COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE estado = 'atendida'))::int AS en_curso,
                (COUNT(*) FILTER (WHERE estado = 'terminada'))::int AS terminadas,
                ROUND((AVG(EXTRACT(EPOCH FROM (fecha_actualizacion - fecha_creacion)) / 60)
                  FILTER (WHERE estado = 'terminada' AND fecha_actualizacion IS NOT NULL))::numeric, 1) AS minutos_promedio
         FROM solicitud WHERE atendido_por = $1`,
        [id]
      ),
      pool.query(
        `SELECT s.id, sa.nombre AS sala, COALESCE(s.categoria, 'sin_categoria') AS categoria,
                s.urgencia, s.estado, LEFT(s.descripcion, 120) AS descripcion,
                s.fecha_creacion, s.fecha_actualizacion
         FROM solicitud s JOIN sala sa ON sa.id = s.sala_id
         WHERE s.usuario_id = $1
         ORDER BY s.fecha_creacion DESC
         LIMIT 10`,
        [id]
      ),
      pool.query(
        `SELECT s.id, sa.nombre AS sala, COALESCE(s.categoria, 'sin_categoria') AS categoria,
                s.urgencia, s.estado, LEFT(s.descripcion, 120) AS descripcion,
                s.nombre_solicitante, s.fecha_creacion, s.fecha_actualizacion
         FROM solicitud s JOIN sala sa ON sa.id = s.sala_id
         WHERE s.atendido_por = $1
         ORDER BY s.fecha_actualizacion DESC NULLS LAST, s.fecha_creacion DESC
         LIMIT 10`,
        [id]
      ),
      // Solo la cantidad: los tokens de dispositivo son secretos y no se exponen
      pool.query('SELECT COUNT(*)::int AS total FROM push_token WHERE usuario_id = $1', [id]),
    ]);

    res.json({
      usuario: usuario.rows[0],
      solicitudes_creadas: { ...creadas.rows[0], recientes: recientesCreadas.rows },
      solicitudes_atendidas: {
        ...atendidas.rows[0],
        minutos_promedio: aNumero(atendidas.rows[0].minutos_promedio), // numeric llega como texto
        recientes: recientesAtendidas.rows,
      },
      dispositivos_notificaciones: dispositivos.rows[0].total,
    });
  } catch (err) {
    console.error('Error en GET /api/usuarios/:id:', err);
    res.status(500).json({ error: 'No se pudo obtener la información del usuario' });
  }
});

module.exports = router;
