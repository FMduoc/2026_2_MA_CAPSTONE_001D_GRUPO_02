// dotenv permite utilizar las variables de entorno/environment sin la necesidad de ejecutar index.js
require('dotenv').config();

const { enviarCorreo } = require('./services/emailService');

const probarEnvio = async () => {
    try {
        const resultado = await enviarCorreo({
            destinatario: 'linkrgx@gmail.com',
            nombreDestinatario: 'Usuario de prueba',
            asunto: 'Prueba de correo - SGCP',

            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h1 style="color: #2563eb;">¡Hola!</h1>
                    <p>Este es un correo de prueba enviado desde SGCP.</p>
                    <p>La integración con Brevo está funcionando.</p>
                    <hr>
                    <small>Equipo SGCP</small>
                </div>
            `,

            texto: 'Este es un correo de prueba enviado desde AsisteQR.'
        });

        console.log('Resultado del envío:', resultado);

    } catch (error) {
        console.error('No se pudo enviar el correo:', error.message);
    }
};

probarEnvio();
