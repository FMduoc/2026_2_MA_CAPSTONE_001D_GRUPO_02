process.env.JWT_SECRET = '5a973bac61f8b041888ba62f1142c5e3cbbfb8a76de5aac58a40c758c6cb75fd';

// Simulaciones: reemplazan Firebase y la base de datos reales
jest.mock('../firebase', () => ({
  messaging: { sendEachForMulticast: jest.fn() },
}));
jest.mock('../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { messaging } = require('../firebase');
const pool = require('../db');
const app = require('../index');

// La notificación se envía en segundo plano: esperamos hasta que se intente
const esperar = async (condicion, ms = 1000) => {
  const limite = Date.now() + ms;
  while (!condicion() && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 10));
  }
};

const tokenDocente = () =>
  jwt.sign({ id: 2, rol: 'solicitante', email: 'prof@duoc.cl' }, process.env.JWT_SECRET);

const solicitudValida = {
  sala_id: 1,
  descripcion: 'Prueba CP-16',
  categoria: 'tecnico',
  urgencia: 'alta',
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // La base simulada responde según la consulta que reciba
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM usuario WHERE id')) {
      return { rows: [{ nombre: 'Profesor', apellido: 'Duoc' }] };
    }
    if (sql.includes('INSERT INTO solicitud')) {
      return { rows: [{ id: 1, categoria: 'tecnico', urgencia: 'alta', descripcion: 'Prueba CP-16' }] };
    }
    if (sql.includes('FROM sala')) return { rows: [{ nombre: 'Sala 204' }] };
    if (sql.includes('push_token')) return { rows: [{ token: 'tok1' }] };
    return { rows: [] };
  });
});

describe('CP-16: notificaciones push', () => {
  test('si Firebase falla, la solicitud se crea igual (201)', async () => {
    messaging.sendEachForMulticast.mockRejectedValue(new Error('Firebase caído'));

    const res = await request(app)
      .post('/api/solicitudes')
      .set('Authorization', `Bearer ${tokenDocente()}`)
      .send(solicitudValida);

    expect(res.status).toBe(201);

    await esperar(() => messaging.sendEachForMulticast.mock.calls.length > 0);
    expect(messaging.sendEachForMulticast).toHaveBeenCalled(); // sí intentó enviar
  });

  test('control: con Firebase operativo, notifica al personal de la categoría', async () => {
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    const res = await request(app)
      .post('/api/solicitudes')
      .set('Authorization', `Bearer ${tokenDocente()}`)
      .send(solicitudValida);

    expect(res.status).toBe(201);

    await esperar(() => messaging.sendEachForMulticast.mock.calls.length > 0);
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['tok1'],
        notification: expect.objectContaining({ title: 'Nueva solicitud: Sala 204' }),
      })
    );
  });
});