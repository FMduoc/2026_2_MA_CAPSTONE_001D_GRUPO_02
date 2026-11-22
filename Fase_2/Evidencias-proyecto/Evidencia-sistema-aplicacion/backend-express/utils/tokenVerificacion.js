
const crypto = require('crypto');

/*
Este código genera un token seguro para verificar el correo.
El token original se envía al usuario.
Su hash es el que se almacena en PostgreSQL.
*/

const generarTokenVerificacion = () => {
    const token = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    // Duración del token. 24 horas.
    const expiracion = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
        token,
        tokenHash,
        expiracion
    };
};

/*
Convierte un token recibido en su hash SHA-256.
Se utiliza posteriormente para compararlo con PostgreSQL.
*/

const hashearToken = (token) => {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
};

module.exports = {
    generarTokenVerificacion,
    hashearToken
};
