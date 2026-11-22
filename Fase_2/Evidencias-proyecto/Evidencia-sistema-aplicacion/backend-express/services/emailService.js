
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
/**
 * Envía un correo electrónico mediante la API de Brevo.
 * @param {Object} opciones
 * @param {string} opciones.destinatario - Correo del receptor.
 * @param {string} opciones.nombreDestinatario - Nombre del receptor.
 * @param {string} opciones.asunto - Asunto del correo.
 * @param {string} opciones.html - Contenido HTML.
 * @param {string} [opciones.texto] - Versión de texto plano.
 */

const enviarCorreo = async ({
    destinatario,
    nombreDestinatario,
    asunto,
    html,
    texto
}) => {
    try {
        const apiKey = process.env.BREVO_API_KEY;
        const remitente = process.env.BREVO_SENDER_EMAIL;
        const nombreRemitente = process.env.BREVO_SENDER_NAME || 'SGCP';

        // Comprobación de la configuración.
        if (!apiKey || !remitente) {
            throw new Error(
                'Faltan variables de entorno.'
            );
        }

        // Comprobar datos del correo
        if (!destinatario || !asunto || (!html && !texto)) {
            throw new Error('Faltan datos obligatorios para enviar el correo.');
        }

        const respuesta = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: {
                    name: nombreRemitente,
                    email: remitente
                },
                to: [
                    {
                        email: destinatario,
                        ...(nombreDestinatario
                            ? { name: nombreDestinatario }
                            : {})
                    }
                ],
                subject: asunto,
                ...(html
                    ? { htmlContent: html }
                    : { textContent: texto })
            })
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            console.error('Error de Brevo:', {
                status: respuesta.status,
                message: resultado.message || 'Error desconocido'
            });

            throw new Error(
                `Brevo rechazó el envío. Código HTTP: ${respuesta.status}`
            );
        }

        console.log('Correo aceptado por Brevo:', resultado.messageId);

        return {
            exitoso: true,
            messageId: resultado.messageId
        };

    } catch (error) {
        console.error('Error al enviar correo:', error.message);
        throw error;
    }
};

module.exports = {
    enviarCorreo
};
