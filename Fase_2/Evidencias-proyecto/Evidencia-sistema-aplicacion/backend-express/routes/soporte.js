
//routes/soporte.js
const express = require('express');
const pool = require('../db');
const verificarToken = require('../middleware/auth');

const router = express.Router();

// =====================================================
// RELACIÓN ENTRE ROL DEL PERSONAL Y CATEGORÍA
// =====================================================

const categoriaPorRol = {
  tecnico: 'tecnico',
  enfermeria: 'enfermeria',
  limpieza: 'limpieza',
  seguridad: 'seguridad'
};

function obtenerCategoriaPorRol(rol) {
  return categoriaPorRol[rol];
}

// =====================================================
// ORDEN DE PRIORIDAD
// =====================================================

const ORDEN_PRIORIDAD = `
  CASE
    WHEN s.estado = 'pendiente' THEN 1
    WHEN s.estado = 'atendida' THEN 2
    WHEN s.estado = 'terminada' THEN 3
    ELSE 4
  END,
  CASE s.urgencia
    WHEN 'critica' THEN 1
    WHEN 'alta'    THEN 2
    WHEN 'media'   THEN 3
    ELSE 4
  END,
  s.fecha_creacion ASC
`;

// =====================================================
// LISTAR SOLICITUDES SEGÚN EL ROL
// =====================================================

router.get('/solicitudes', verificarToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const rol = req.usuario.rol;

  const categoria = obtenerCategoriaPorRol(rol);

  if (!categoria) {
    return res.status(403).json({
      error: 'El usuario no posee un rol de soporte válido'
    });
  }

  try {
    const usuarioResult = await pool.query(
      'SELECT disponible FROM usuario WHERE id = $1',
      [usuarioId]
    );

    const disponible = usuarioResult.rows[0]?.disponible ?? true;

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.sala_id,
        sa.nombre AS sala_nombre,
        s.usuario_id,
        s.nombre_solicitante,
        s.descripcion,
        s.categoria,
        s.urgencia,
        s.estado,
        s.atendido_por,
        s.descripcion_trabajo,
        s.fecha_creacion,
        s.fecha_actualizacion
      FROM solicitud s
      JOIN sala sa ON s.sala_id = sa.id
      WHERE s.categoria = $1
        AND (
          s.estado = 'terminada'
          OR $2 = true
          OR (s.estado = 'atendida' AND s.atendido_por = $3)
        )
      ORDER BY ${ORDEN_PRIORIDAD}
      `,
      [categoria, disponible, usuarioId]
    );

    return res.json(result.rows);

  } catch (err) {
    console.error('Error al obtener solicitudes de soporte:', err);

    return res.status(500).json({
      error: err.message
    });
  }
});

// =====================================================
// NOTIFICACIONES SEGÚN ROL
// =====================================================

router.get('/notificaciones', verificarToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const rol = req.usuario.rol;

  const categoria = obtenerCategoriaPorRol(rol);

  if (!categoria) {
    return res.status(403).json({
      error: 'El usuario no posee un rol de soporte válido'
    });
  }

  try {
    const usuarioResult = await pool.query(
      'SELECT disponible FROM usuario WHERE id = $1',
      [usuarioId]
    );

    const disponible = usuarioResult.rows[0]?.disponible ?? true;

    if (!disponible) {
      return res.json({
        cantidad: 0,
        solicitudes: []
      });
    }

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.descripcion,
        s.categoria,
        s.urgencia,
        s.estado,
        s.fecha_creacion,
        sa.nombre AS sala_nombre
      FROM solicitud s
      JOIN sala sa ON s.sala_id = sa.id
      WHERE s.categoria = $1
        AND s.estado = 'pendiente'
      ORDER BY
        CASE s.urgencia
          WHEN 'critica' THEN 1
          WHEN 'alta'    THEN 2
          WHEN 'media'   THEN 3
          ELSE 4
        END,
        s.fecha_creacion DESC
      `,
      [categoria]
    );

    return res.json({
      cantidad: result.rows.length,
      solicitudes: result.rows
    });

  } catch (err) {
    console.error('Error al obtener notificaciones:', err);

    return res.status(500).json({
      error: err.message
    });
  }
});

// =====================================================
// ATENDER SOLICITUD
// PROTECCIÓN CONTRA DOBLE ASIGNACIÓN
// PRUEBA CP-21
// =====================================================

router.patch(
  '/solicitudes/:id/atender',
  verificarToken,
  async (req, res) => {

    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const rol = req.usuario.rol;

    const categoria = obtenerCategoriaPorRol(rol);

    if (!categoria) {
      return res.status(403).json({
        error: 'El usuario no posee un rol de soporte válido'
      });
    }

    try {

      // PostgreSQL realiza este UPDATE de forma atómica.
      // Solo un técnico puede cambiar la solicitud
      // desde pendiente a atendida.

      const result = await pool.query(
        `
        UPDATE solicitud
        SET
          estado = 'atendida',
          atendido_por = $1,
          fecha_actualizacion = NOW()
        WHERE
          id = $2
          AND categoria = $3
          AND estado = 'pendiente'
          AND atendido_por IS NULL
        RETURNING *
        `,
        [
          usuarioId,
          id,
          categoria
        ]
      );

      // ===============================================
      // SOLICITUD ASIGNADA CORRECTAMENTE
      // ===============================================

      if (result.rowCount > 0) {
        return res.status(200).json({
          mensaje: 'Solicitud asignada correctamente',
          solicitud: result.rows[0]
        });
      }

      // ===============================================
      // REVISAR POR QUÉ NO SE PUDO ASIGNAR
      // ===============================================

      const verificacion = await pool.query(
        `
        SELECT
          id,
          estado,
          atendido_por
        FROM solicitud
        WHERE id = $1
          AND categoria = $2
        `,
        [id, categoria]
      );

      // La solicitud no existe o pertenece a otra área.
      if (verificacion.rows.length === 0) {
        return res.status(404).json({
          error: 'Solicitud no encontrada o no corresponde a tu área'
        });
      }

      // La solicitud existe, pero ya no se puede tomar.
      // El frontend deberá mostrar un modal al recibir 409.

      return res.status(409).json({
        error: 'Esta solicitud ya está siendo atendida por otro técnico o no está disponible.',
        codigo: 'SOLICITUD_NO_DISPONIBLE'
      });

    } catch (err) {
      console.error('Error al atender solicitud:', err);

      return res.status(500).json({
        error: err.message
      });
    }
  }
);

// =====================================================
// MARCAR SOLICITUD COMO TERMINADA
// =====================================================

router.patch('/solicitudes/:id/terminar', verificarToken, async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario.id;
  const categoria = obtenerCategoriaPorRol(req.usuario.rol);

  if (!categoria) {
    return res.status(403).json({ error: 'El usuario no posee un rol de soporte válido' });
  }

  const codigoQr = typeof req.body?.codigo_qr === 'string' ? req.body.codigo_qr.trim() : '';
  if (!codigoQr) {
    return res.status(400).json({
      error: 'Debes escanear el código QR de la sala para cerrar la solicitud',
    });
  }

  const ERROR_NO_DISPONIBLE =
    'La solicitud no existe, no está atendida o está asignada a otro usuario';

  try {
    const actual = await pool.query(
      `SELECT s.categoria, s.estado, s.atendido_por, sa.codigo_qr
       FROM solicitud s
       JOIN sala sa ON sa.id = s.sala_id
       WHERE s.id = $1`,
      [id]
    );

    const s = actual.rows[0];

    if (
      !s ||
      s.categoria !== categoria ||
      s.estado !== 'atendida' ||
      Number(s.atendido_por) !== Number(usuarioId)
    ) {
      return res.status(404).json({ error: ERROR_NO_DISPONIBLE });
    }

    if (s.codigo_qr !== codigoQr) {
      return res.status(422).json({
        error: 'El código QR no corresponde a la sala de esta solicitud',
      });
    }

    // La condición se repite en el UPDATE por si el estado cambió entre las dos consultas
    const result = await pool.query(
      `UPDATE solicitud
       SET estado = 'terminada', fecha_actualizacion = NOW()
       WHERE id = $1 AND categoria = $2 AND estado = 'atendida' AND atendido_por = $3
       RETURNING *`,
      [id, categoria, usuarioId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: ERROR_NO_DISPONIBLE });
    }

    res.json({ mensaje: 'Solicitud marcada como terminada', solicitud: result.rows[0] });
  } catch (err) {
    console.error('Error al terminar solicitud:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// DESCRIPCIÓN DEL TRABAJO REALIZADO (opcional, tras terminar)
// =====================================================

router.patch('/solicitudes/:id/descripcion-trabajo', verificarToken, async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario.id;
  const categoria = obtenerCategoriaPorRol(req.usuario.rol);

  if (!categoria) {
    return res.status(403).json({ error: 'El usuario no posee un rol de soporte válido' });
  }

  const texto =
    typeof req.body?.descripcion_trabajo === 'string' ? req.body.descripcion_trabajo.trim() : '';

  if (!texto) {
    return res.status(400).json({ error: 'La descripción del trabajo no puede estar vacía' });
  }
  if (texto.length > 500) {
    return res.status(400).json({ error: 'La descripción no puede superar los 500 caracteres' });
  }

  try {
    // Solo quien atendió y terminó la solicitud puede describir el trabajo.
    // No se toca fecha_actualizacion para conservar la hora real del cierre.
    const result = await pool.query(
      `UPDATE solicitud
       SET descripcion_trabajo = $1
       WHERE id = $2 AND categoria = $3 AND estado = 'terminada' AND atendido_por = $4
       RETURNING id, descripcion_trabajo`,
      [texto, id, categoria, usuarioId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'La solicitud no existe, no está terminada o fue atendida por otro usuario',
      });
    }

    res.json({ mensaje: 'Descripción guardada', solicitud: result.rows[0] });
  } catch (err) {
    console.error('Error al guardar descripción del trabajo:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// DISPONIBILIDAD DEL PERSONAL DE SOPORTE
// =====================================================

router.patch('/disponibilidad', verificarToken, async (req, res) => {
  const { disponible } = req.body;
  const usuarioId = req.usuario.id;
  const rol = req.usuario.rol;

  const categoria = obtenerCategoriaPorRol(rol);

  if (!categoria) {
    return res.status(403).json({
      error: 'Solo el personal de soporte puede actualizar su disponibilidad'
    });
  }

  if (typeof disponible !== 'boolean') {
    return res.status(400).json({
      error: 'disponible debe ser true o false'
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE usuario
      SET disponible = $1
      WHERE id = $2
      RETURNING id, nombre, apellido, rol, disponible
      `,
      [disponible, usuarioId]
    );

    return res.json(result.rows[0]);

  } catch (err) {
    console.error('Error al actualizar disponibilidad:', err);

    return res.status(500).json({
      error: err.message
    });
  }
});

// =====================================================
// COBERTURA DE PERSONAL POR CATEGORÍA
// =====================================================

router.get('/cobertura/:categoria', verificarToken, async (req, res) => {
  const { categoria } = req.params;
  const categoriasValidas = Object.values(categoriaPorRol);

  if (!categoriasValidas.includes(categoria)) {
    return res.status(400).json({
      error: 'Categoría no válida'
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)
      FROM usuario
      WHERE rol = $1::rol_usuario
        AND disponible = true
      `,
      [categoria]
    );

    const hayDisponibles =
      parseInt(result.rows[0].count, 10) > 0;

    return res.json({
      categoria,
      hayDisponibles
    });

  } catch (err) {
    console.error('Error al consultar cobertura:', err);

    return res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
