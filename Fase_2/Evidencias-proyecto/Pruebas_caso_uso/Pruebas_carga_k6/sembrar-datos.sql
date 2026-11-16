-- sembrar-datos.sql
-- SOLO para la base de pruebas. Crea 15.000 solicitudes ficticias (≈ 5 años de uso esperado)
-- para medir cómo responden los listados cuando la tabla ya tiene mucho volumen.
-- Requiere: al menos una sala y las cuentas solicitante@test.cl y tecnico@test.cl.

WITH
  s AS (SELECT array_agg(id ORDER BY id) AS ids FROM sala),
  u AS (
    SELECT
      (SELECT id FROM usuario WHERE email = 'solicitante@test.cl') AS solicitante_id,
      (SELECT id FROM usuario WHERE email = 'tecnico@test.cl')     AS tecnico_id
  )
INSERT INTO solicitud
  (sala_id, usuario_id, nombre_solicitante, descripcion, categoria, urgencia,
   estado, atendido_por, fecha_creacion, fecha_actualizacion)
SELECT
  s.ids[1 + (g % array_length(s.ids, 1))],
  u.solicitante_id,
  'Solicitante de prueba',
  'Solicitud sembrada ' || g,
  (ARRAY['tecnico', 'enfermeria', 'seguridad', 'limpieza'])[1 + (g % 4)],
  (ARRAY['baja', 'media', 'alta', 'critica'])[1 + ((g / 4) % 4)],
  CASE WHEN g % 10 = 0 THEN 'pendiente'
       WHEN g % 10 = 1 THEN 'atendida'
       ELSE 'terminada' END,
  CASE WHEN g % 10 = 0 THEN NULL ELSE u.tecnico_id END,
  NOW() - make_interval(mins => g),
  CASE WHEN g % 10 = 0 THEN NULL
       ELSE NOW() - make_interval(mins => g) + interval '10 minutes' END
FROM generate_series(1, 15000) AS g, s, u;

-- Comprobación
SELECT estado, COUNT(*) FROM solicitud GROUP BY estado;

-- Limpieza al terminar las pruebas (borra lo sembrado y lo creado por k6)
-- DELETE FROM solicitud
--  WHERE descripcion LIKE 'Solicitud sembrada %' OR descripcion = 'Prueba de carga k6';
