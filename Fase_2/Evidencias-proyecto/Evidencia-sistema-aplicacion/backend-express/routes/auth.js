const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const router = express.Router();

// Registro de usuarios
router.post('/register', async (req, res) => {
  const { nombre, apellido, email, rut, telefono, contrasena, rol } = req.body;

  if (!nombre || !apellido || !email || !rut || !telefono || !contrasena || !rol) {
    return res.status(400).json({
      error: 'Todos los campos son obligatorios'
    });
  }

  if (contrasena.length < 8) {
    return res.status(400).json({
      error: 'La contraseña debe tener al menos 8 caracteres'
    });
  }

  const rolesPermitidos = ['solicitante', 'staff'];

  if (!rolesPermitidos.includes(rol)) {
    return res.status(400).json({
      error: 'Rol no válido'
    });
  }

  const rutNormalizado = normalizarRut(rut);
  const telefonoNormalizado = String(telefono).trim();
  const correoNormalizado = String(email).trim().toLowerCase();

  if (!validarRut(rutNormalizado)) {
    return res.status(400).json({
      error: 'El RUT ingresado no es válido'
    });
  }

  // Validación básica del teléfono.
  const telefonoDigitos = telefonoNormalizado.replace(/\D/g, '');

  if (
    telefonoDigitos.length < 8 ||
    telefonoDigitos.length > 15
  ) {
    return res.status(400).json({
      error: 'El teléfono ingresado no es válido'
    });
  }

  try {

    const existente = await pool.query(
      `SELECT id
       FROM usuario
       WHERE email = $1 OR rut = $2`,
      [correoNormalizado, rutNormalizado]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        error: 'Ese email ya está registrado'
      });
    }

    const contrasena_hash = await bcrypt.hash(contrasena, 10);

    const result = await pool.query(
      `INSERT INTO usuario
        (nombre, apellido, email, contrasena_hash, rol, rut, telefono)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
        id,
        nombre,
        apellido,
        email,
        rut,
        telefono,
        rol,
        fecha_creacion`,
      [
        nombre.trim(),
        apellido.trim(),
        correoNormalizado,
        contrasena_hash,
        rol,
        rutNormalizado,
        telefonoNormalizado,
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.status(409).json({
        error: 'El email o RUT ya está registrado'
      });
    }

    res.status(500).json({
      error: 'No se pudo registrar el usuario'
    });
  }
});


// Login de usuarios
router.post('/login', async (req, res) => {
  const { email, contrasena } = req.body;

  if (!email || !contrasena) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const result = await pool.query('SELECT * FROM usuario WHERE email = $1', [email]);
    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rut: usuario.rut,
        telefono: usuario.telefono,
        rol: usuario.rol,
        disponible: usuario.disponible, // <-- agregado
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Perfil actual del usuario autenticado (datos frescos desde la BD)
router.get('/me', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, apellido, email, rut, telefono, rol, disponible
       FROM usuario
       WHERE id = $1`,
      [req.usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
const usuario = result.rows[0];

// Token renovado con el rol actual, para que las rutas protegidas lo reconozcan
const token = jwt.sign(
  { id: usuario.id, rol: usuario.rol, email: usuario.email },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN }
);

res.json({ ...usuario, token });
  } catch (err) {
    console.error('Error en /api/auth/me:', err);
    res.status(500).json({ error: err.message });
  }
});

// Función Módulo 11 | RUT

// Normalizar RUT: eliminar puntos, espacios y convertir k en K.
const normalizarRut = (rut) => {
  return String(rut)
    .replace(/\./g, '')
    .replace(/\s/g, '')
    .toUpperCase();
};

// Validar RUT chileno mediante módulo 11.
const validarRut = (rut) => {
  const rutNormalizado = normalizarRut(rut);

  if (!/^\d{7,8}-[\dK]$/.test(rutNormalizado)) {
    return false;
  }

  const [cuerpo, digitoIngresado] = rutNormalizado.split('-');

  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;

    multiplicador =
      multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);

  let digitoCalculado;

  if (resto === 11) {
    digitoCalculado = '0';
  } else if (resto === 10) {
    digitoCalculado = 'K';
  } else {
    digitoCalculado = String(resto);
  }

  return digitoCalculado === digitoIngresado;
};

module.exports = router;