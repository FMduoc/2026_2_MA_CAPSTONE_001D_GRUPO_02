// carga.js — Pruebas de carga y estrés de AsisteQR con k6
//
// Uso (PowerShell, desde la carpeta de este archivo):
//   k6 run -e PERFIL=humo   carga.js
//   k6 run -e PERFIL=carga  --summary-export=resumen-carga.json  carga.js
//   k6 run -e PERFIL=estres --summary-export=resumen-estres.json carga.js
//
// Variables opcionales (-e NOMBRE=valor):
//   BASE_URL, PASS, SOL_EMAIL, TEC_EMAIL, ADMIN_EMAIL
//
// Qué simula: usuarios que crean solicitudes (60 %), personal que consulta su bandeja (30 %)
// y el administrador que revisa el historial (10 %). Los logins se hacen UNA vez en setup(),
// porque en la vida real el token dura horas y bcrypt es costoso: repetir el login en cada
// iteración mediría bcrypt y no la aplicación.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const PERFIL = __ENV.PERFIL || 'humo';

const CUENTAS = {
  solicitante: {
    email: __ENV.SOL_EMAIL || 'solicitante@test.cl',
    password: __ENV.SOL_PASS || 'solicitante123',
  },
  tecnico: {
    email: __ENV.TEC_EMAIL || 'tecnico@test.cl',
    password: __ENV.TEC_PASS || 'tecnico123',
  },
  admin: {
    email: __ENV.ADMIN_EMAIL || 'admin@duoc.cl',
    password: __ENV.ADMIN_PASS || 'admin123',
  },
};


const CATEGORIAS = ['tecnico', 'enfermeria', 'seguridad', 'limpieza'];
const URGENCIAS = ['baja', 'media', 'alta', 'critica'];

// "target" es la cantidad de iteraciones (≈ solicitudes HTTP) por segundo, no usuarios.
// Para convertirlo en usuarios: usuarios ≈ solicitudes por segundo × segundos entre acciones de cada usuario.
const PERFILES = {
  // Verifica que el script y las cuentas funcionan
  humo: { executor: 'constant-vus', vus: 2, duration: '30s' },

  // Carga sostenida: 10 solicitudes/s durante 4 minutos (muy por encima del uso real previsto, unas 15 al día)
  carga: {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: 20,
    maxVUs: 200,
    stages: [
      { target: 10, duration: '1m' },
      { target: 10, duration: '4m' },
      { target: 0, duration: '30s' },
    ],
  },

  // Estrés: sube la tasa por escalones hasta encontrar el punto de quiebre
  estres: {
    executor: 'ramping-arrival-rate',
    startRate: 5,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 1000,
    stages: [
      { target: 10, duration: '1m' },
      { target: 20, duration: '1m' },
      { target: 40, duration: '1m' },
      { target: 80, duration: '1m' },
      { target: 160, duration: '1m' },
      { target: 320, duration: '1m' },
      { target: 0, duration: '30s' },
    ],
  },
};

if (!PERFILES[PERFIL]) {
  throw new Error(`PERFIL desconocido: ${PERFIL}. Usa humo, carga o estres.`);
}

export const options = {
  scenarios: { principal: PERFILES[PERFIL] },
  thresholds: {
    // Criterio de aceptación: menos de 1 % de errores...
    // ...y corte automático si los errores superan el 20 % (el sistema ya está caído)
    http_req_failed: [
      'rate<0.01',
      { threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '20s' },
    ],
    checks: ['rate>0.99'],
    // Latencia p95 por endpoint
    'http_req_duration{name:crear_solicitud}': ['p(95)<500'],
    'http_req_duration{name:listar_soporte}': ['p(95)<800'],
    'http_req_duration{name:historial_admin}': ['p(95)<800'],
  },
};

const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const cabeceras = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

// Se ejecuta una sola vez antes de la prueba
export function setup() {
  const tokens = {};

  for (const rol of Object.keys(CUENTAS)) {
    const cuenta = CUENTAS[rol];

    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({
        email: cuenta.email,
        contrasena: cuenta.password,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'setup_login' },
      }
    );

    if (res.status !== 200) {
      throw new Error(
        `Login fallido (${rol}, ${cuenta.email}): HTTP ${res.status} ${res.body}`
      );
    }

    tokens[rol] = res.json('token');
  }

  const salas = http.get(`${BASE_URL}/salas`, {
    headers: cabeceras(tokens.admin),
    tags: { name: 'setup_salas' },
  });
  if (salas.status !== 200) {
    throw new Error(`No se pudieron listar las salas: HTTP ${salas.status}`);
  }
  const salaIds = salas.json().map((s) => s.id);
  if (salaIds.length === 0) {
    throw new Error('No hay salas en la base de pruebas. Crea al menos una.');
  }

  return { tokens, salaIds };
}

function crearSolicitud(data) {
  const cuerpo = JSON.stringify({
    sala_id: elegir(data.salaIds),
    descripcion: 'Prueba de carga k6',
    categoria: elegir(CATEGORIAS),
    urgencia: elegir(URGENCIAS),
  });
  const res = http.post(`${BASE_URL}/solicitudes`, cuerpo, {
    headers: cabeceras(data.tokens.solicitante),
    tags: { name: 'crear_solicitud' },
  });
  if (res.status !== 201) {
    console.error(
      `ERROR AL CREAR SOLICITUD:
      HTTP ${res.status}
      RESPUESTA: ${res.body}`
    );
  }
  check(res, {
    'solicitud creada (201)': (r) => r.status === 201,
  });
}

function listarSoporte(data) {
  const res = http.get(`${BASE_URL}/soporte/solicitudes`, {
    headers: cabeceras(data.tokens.tecnico),
    tags: { name: 'listar_soporte' },
  });
  check(res, { 'bandeja del personal (200)': (r) => r.status === 200 });
}

function historialAdmin(data) {
  const res = http.get(`${BASE_URL}/admin/solicitudes`, {
    headers: cabeceras(data.tokens.admin),
    tags: { name: 'historial_admin' },
  });
  check(res, { 'historial del administrador (200)': (r) => r.status === 200 });
}

export default function (data) {
  const azar = Math.random();
  if (azar < 0.6) crearSolicitud(data);
  else if (azar < 0.9) listarSoporte(data);
  else historialAdmin(data);

  // En el perfil "humo" hay VUs fijos, así que se pausa para no saturar
  if (PERFIL === 'humo') sleep(1);
}

/*
COMANDOS PARA EJECUTAR PRUEBAS:
k6 run -e PERFIL=humo carga.js
k6 run -e PERFIL=carga --summary-export=resumen-carga.json carga.js
k6 run -e PERFIL=estres --summary-export=resumen-estres.json carga.js
*/