const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const verificarToken = require('../middleware/auth');
const router = express.Router();
// Verificación por correo electrónico.
const { generarTokenVerificacion, hashearToken } = require('../utils/tokenVerificacion');
const { enviarCorreo } = require('../services/emailService');
const { rateLimit } = require('express-rate-limit'); // Utilizado para poner un límite al reenvío de correos de verificación.

// Función para evitar nombres en HTML de correo.
const escaparHTML = (texto) => {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Configuración de límites de reenvío de correos de verificación.
const limiteReenvioVerificacion = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5,                 // máximo 5 solicitudes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Has realizado demasiadas solicitudes. Inténtalo nuevamente más tarde.'
  }
});

/*
---------------------
Registro de usuarios.
---------------------
*/

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
    // Comprobar que el backend tenga configurada su URL pública.
    const backendUrl = process.env.BACKEND_URL;

    if (!backendUrl) {
      console.error('Falta configurar BACKEND_URL en .env');

      return res.status(500).json({
        error: 'El servicio de verificación no está configurado'
      });
    }

    // Comprobación de si ya existe un usuario con el e-mail o RUT ingresado.
    /*
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
    */
    const emailExistente = await pool.query(
      'SELECT id FROM usuario WHERE email = $1',
      [email]
    );

    if (emailExistente.rows.length > 0) {
      return res.status(409).json({
        error: 'Ese email ya está registrado',
        codigo: 'EMAIL_DUPLICADO'
      });
    }

    const rutExistente = await pool.query(
      'SELECT id FROM usuario WHERE rut = $1',
      [rutNormalizado]
    );

    if (rutExistente.rows.length > 0) {
      return res.status(409).json({
        error: 'Ese RUT ya está registrado',
        codigo: 'RUT_DUPLICADO'
      });
    }

    // Encriptación de contraseña.
    const contrasena_hash = await bcrypt.hash(contrasena, 10);

    // Generar token y fecha de expiración.
    const {
      token,
      tokenHash,
      expiracion
    } = generarTokenVerificacion();

    const result = await pool.query(
      `INSERT INTO usuario
        (nombre, apellido, email, contrasena_hash, rol, rut, telefono, email_verificado, token_verificacion, token_verificacion_expira)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9)
       RETURNING
        id,
        nombre,
        apellido,
        email,
        rut,
        telefono,
        rol,
        fecha_creacion,
        email_verificado`,
      [
        nombre.trim(),
        apellido.trim(),
        correoNormalizado,
        contrasena_hash,
        rol,
        rutNormalizado,
        telefonoNormalizado,
        tokenHash,
        expiracion
      ]
    );

    const usuario = result.rows[0];

    // Crear enlace de verificación.
    const baseUrl = backendUrl.replace(/\/+$/, '');

    const enlaceVerificacion =
      `${baseUrl}/api/auth/verificar-email?token=${encodeURIComponent(token)}`;

    // Preparación de contenido del correo.
    const nombreSeguro = escaparHTML(usuario.nombre);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; color: #333;">
        <h1 style="color: #2563eb;">¡Bienvenido a SGCP!</h1>

        <p>Hola, ${nombreSeguro}.</p>

        <p>
          Gracias por registrarte en SGCP.
          Para activar tu cuenta, necesitamos verificar
          que esta dirección de correo electrónico te pertenece.
        </p>

        <div style="text-align: center; margin: 35px 0;">
          <a
            href="${enlaceVerificacion}"
            style="
              background-color: #2563eb;
              color: white;
              padding: 14px 25px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
            "
          >
            Verificar mi correo
          </a>
        </div>

        <p>
          Este enlace tiene una duración de 24 horas
          y solamente puede utilizarse una vez.
        </p>

        <p>
          Si no solicitaste esta cuenta, puedes ignorar este mensaje.
        </p>

        <hr>

        <small style="color: #777;">
          Equipo SGCP
        </small>
      </div>`;

    const texto = `
      ¡Bienvenido a SGCP!

      Hola, ${usuario.nombre}.

      Para verificar tu correo electrónico y activar tu cuenta,
      visita el siguiente enlace:

      ${enlaceVerificacion}

      Este enlace vence en 24 horas.

      Equipo SGCP.`;

    // Intentar enviar el correo.
    let correoEnviado = false;

    try {
      await enviarCorreo({
        destinatario: usuario.email,
        nombreDestinatario: `${usuario.nombre} ${usuario.apellido}`,
        asunto: 'Verifica tu correo electrónico - SGCP',
        html,
        texto
      });

      correoEnviado = true;

    } catch (errorCorreo) {
      // La cuenta queda registrada, pero pendiente de verificación.
      console.error(
        'No se pudo enviar el correo de verificación:',
        errorCorreo.message
      );
    }

    return res.status(201).json({
      ...usuario,
      mensaje: correoEnviado
        ? 'Usuario registrado. Revisa tu correo para verificar tu cuenta.'
        : 'Usuario registrado, pero no se pudo enviar el correo. Solicita un nuevo envío más adelante.',
      correoEnviado
    });

  } catch (err) {
    console.error('Error al registrar usuario:', err);

    if (err.code === '23505') {
      return res.status(409).json({
        error: 'El email o RUT ya está registrado'
      });
    }

    return res.status(500).json({
      error: 'No se pudo registrar el usuario'
    });
  }
});


/*
------------------------------
Verificación de email y token.
------------------------------
*/

// Página intermedia de confirmación que se asegura de que no se consuma el token.
router.get('/verificar-email', (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Enlace inválido - SGCP</title>
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>Enlace inválido</h1>
          <p>El enlace de verificación no es válido.</p>
        </body>
      </html>
    `);
  }

  // El token solo se consume cuando el usuario pulsa el botón.
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'no-store');

  // Verificación de la configuración
  if (!process.env.BACKEND_URL) {
  return res.status(500).send('El servicio de verificación no está configurado.');
  }

  const actionUrl =
    `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api/auth/verificar-email/confirmar?token=${encodeURIComponent(token)}`;

  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificar correo - SGCP</title>
      </head>

      <body style="
        font-family: Arial, sans-serif;
        background: #f3f4f6;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        margin: 0;
      ">
        <div style="
          background: white;
          max-width: 420px;
          width: 90%;
          padding: 35px;
          border-radius: 12px;
          text-align: center;
          box-sizing: border-box;
        ">
          <h1 style="color: #2563eb;">SGCP</h1>

          <h2>Verificación de correo electrónico</h2>

          <p>
            Estás a un paso de activar tu cuenta.
            Pulsa el siguiente botón para confirmar
            que esta dirección de correo te pertenece.
          </p>

          <form method="POST" action="${actionUrl}">
            <button type="submit" style="
              background: #2563eb;
              color: white;
              border: none;
              padding: 14px 25px;
              border-radius: 7px;
              font-size: 16px;
              cursor: pointer;
            ">
              Confirmar mi correo
            </button>
          </form>

          <p style="color: #777; font-size: 13px; margin-top: 25px;">
            Si no solicitaste esta verificación,
            puedes cerrar esta página.
          </p>
        </div>
      </body>
    </html>
  `);
});

// Confirmar el correo electrónico.
// Este POST consume el token y activa la cuenta.
router.post('/verificar-email/confirmar', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).send(`
      <h1>Enlace inválido</h1>
      <p>El enlace de verificación no es válido.</p>
    `);
  }

  try {
    // Calcular el hash del token recibido.
    const tokenHash = hashearToken(token);

    // Activación de la cuenta solamente si el token existe y
    // no ha vencido/todavía no se ha utilizado.
    const result = await pool.query(
      `UPDATE usuario
       SET
         email_verificado = TRUE,
         token_verificacion = NULL,
         token_verificacion_expira = NULL
       WHERE
         token_verificacion = $1
         AND token_verificacion_expira > NOW()
         AND email_verificado = FALSE
       RETURNING id`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="UTF-8">
            <title>Verificación no completada - SGCP</title>
          </head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>No se pudo verificar el correo</h1>
            <p>
              El enlace puede haber vencido, haber sido utilizado
              anteriormente o no ser válido.
            </p>
            <p>Solicita un nuevo enlace de verificación.</p>
          </body>
        </html>
      `);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Correo verificado - SGCP</title>
        </head>
        <body style="
          font-family: Arial, sans-serif;
          background: #f3f4f6;
          text-align: center;
          padding: 50px 20px;
        ">
          <div style="
            background: white;
            max-width: 420px;
            margin: auto;
            padding: 35px;
            border-radius: 12px;
          ">
            <h1 style="color: #16a34a;">¡Correo verificado!</h1>
            <p>
              Tu dirección de correo electrónico ha sido
              confirmada correctamente.
            </p>
            <p>Tu cuenta de SGCP ya está activada.</p>
            <p>Ahora puedes iniciar sesión desde la aplicación.</p>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Error al verificar correo:', err);

    return res.status(500).send(`
      <h1>Error del servidor</h1>
      <p>No se pudo completar la verificación. Inténtalo más tarde.</p>
    `);
  }
});

/*
------------------
Login de usuarios.
------------------
*/


router.post('/login', async (req, res) => {
  try {
    const { email, contrasena } = req.body;

    // Validación de los campos recibidos.
    if (!email || !contrasena) {
      return res.status(400).json({
        error: 'Debes ingresar tu correo electrónico y contraseña.'
      });
    }

    // Normalización del correo.
    const emailNormalizado = email.trim().toLowerCase();

    // Verificación de si existe el usuario.
    const resultado = await pool.query(
      'SELECT * FROM usuario WHERE email = $1',
      [emailNormalizado]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales inválidas.'
      });
    }

    const usuario = resultado.rows[0];

    // Comprobación de la contraseña.
    const passwordValida = await bcrypt.compare(
      contrasena,
      usuario.contrasena_hash
    );

    if (!passwordValida) {
      return res.status(401).json({
        error: 'Credenciales inválidas.'
      });
    }

    // Compobación de si el correo está verificado.
    if (!usuario.email_verificado) {
      return res.status(403).json({
        error: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
        codigo: 'EMAIL_NO_VERIFICADO'
      });
    }

    // Generación del JWT.
    const token = jwt.sign(
      {
        id: usuario.id,
        rol: usuario.rol,
        email: usuario.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Respuesta con los datos del usuario.
    res.json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rut: usuario.rut,
        telefono: usuario.telefono,
        rol: usuario.rol,
        disponible: usuario.disponible
      }
    });

  } catch (error) {
    console.error('Error en login:', error);

    res.status(500).json({
      error: 'Error interno del servidor al iniciar sesión.'
    });
  }
});

/*
---------------------------------------------
Reenvío de correo de verificación de usuario.
---------------------------------------------
*/

router.post(
  '/reenviar-verificacion',
  limiteReenvioVerificacion,
  async (req, res) => {
    try {
      const { email } = req.body;

      // Validación del correo recibido
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({
          error: 'Debes ingresar un correo electrónico válido.'
        });
      }

      const emailNormalizado = email.trim().toLowerCase();

      // Comprobación de la configuración del servicio
      if (!process.env.BACKEND_URL) {
        console.error('Falta configurar BACKEND_URL.');
        return res.status(500).json({
          error: 'No fue posible procesar la solicitud.'
        });
      }

      // Generación de un nuevo token.
      const { token, tokenHash, expiracion } =
        generarTokenVerificacion();

      // Actualización del token solamente si la cuenta existe y todavía no ha sido verificada.
      const resultado = await pool.query(
        `UPDATE usuario
         SET
           token_verificacion = $1,
           token_verificacion_expira = $2
         WHERE
           email = $3
           AND email_verificado = FALSE
         RETURNING id, nombre, email`,
        [tokenHash, expiracion, emailNormalizado]
      );

      // Si existe una cuenta pendiente, se envía el correo.
      if (resultado.rows.length > 0) {
        const usuario = resultado.rows[0];

        const enlaceVerificacion =
          `${process.env.BACKEND_URL.replace(/\/+$/, '')}` +
          `/api/auth/verificar-email?token=${encodeURIComponent(token)}`;

        const nombreSeguro = escaparHTML(usuario.nombre);

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2>SGCP - Verificación de correo</h2>

            <p>Hola, ${nombreSeguro}.</p>

            <p>
              Has solicitado un nuevo enlace para verificar
              tu dirección de correo electrónico.
            </p>

            <p>
              Haz clic en el siguiente botón para verificar tu cuenta:
            </p>

            <a href="${enlaceVerificacion}"
               style="
                 display: inline-block;
                 padding: 12px 20px;
                 background-color: #2563eb;
                 color: white;
                 text-decoration: none;
                 border-radius: 6px;
               ">
              Verificar mi correo
            </a>

            <p>
              Este enlace expirará en 24 horas.
            </p>

            <p>
              Si no solicitaste este correo, puedes ignorarlo.
            </p>

            <p>Equipo SGCP</p>
          </div>
        `;

        const texto = `
          Hola, ${usuario.nombre}.

          Has solicitado un nuevo enlace para verificar tu correo electrónico.

          Ingresa al siguiente enlace:
          ${enlaceVerificacion}

          Este enlace expirará en 24 horas.

          Si no solicitaste este correo, puedes ignorarlo.

          Equipo SGCP.`;

        try {
          await enviarCorreo({
            destinatario: usuario.email,
            nombreDestinatario: usuario.nombre,
            asunto: 'Nuevo enlace de verificación - SGCP',
            html,
            texto
          });

        } catch (errorCorreo) {
          console.error(
            'No se pudo enviar el correo de verificación:',
            errorCorreo.message
          );
        }
      }

      // Se envía una respuesta genérica que no revele si existe ese correo registrado en el sistema.
      return res.status(200).json({
        mensaje:
          'Si existe una cuenta pendiente de verificación con ese correo, recibirás un nuevo enlace.'
      });

    } catch (error) {
      console.error('Error al reenviar verificación:', error);

      return res.status(500).json({
        error: 'Ocurrió un error al procesar la solicitud.'
      });
    }
  }
);

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

/*
---------------
Módulo 11: RUTs
---------------
*/

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