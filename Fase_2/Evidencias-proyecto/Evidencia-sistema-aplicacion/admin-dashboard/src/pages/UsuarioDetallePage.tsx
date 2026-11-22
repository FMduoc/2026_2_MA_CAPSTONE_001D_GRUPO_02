// src/pages/UsuarioDetallePage.tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { usuarioDetalleService } from '../services/usuarioDetalleService';
import type { SolicitudResumen, UsuarioDetalle } from '../services/usuarioDetalleService';

type ColorChip = 'default' | 'info' | 'warning' | 'error' | 'success';

const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  solicitante: 'Solicitante',
  docente: 'Solicitante',
  staff: 'Personal sin categoría',
  tecnico: 'Soporte técnico',
  enfermeria: 'Enfermería',
  seguridad: 'Seguridad',
  limpieza: 'Limpieza',
};

const ETIQUETA_CATEGORIA: Record<string, string> = {
  tecnico: 'Servicio técnico',
  enfermeria: 'Emergencia médica',
  seguridad: 'Seguridad',
  limpieza: 'Limpieza',
  sin_categoria: 'Sin categoría',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  atendida: 'En progreso',
  terminada: 'Finalizado',
};

const COLOR_ESTADO: Record<string, ColorChip> = {
  pendiente: 'warning',
  atendida: 'info',
  terminada: 'success',
};

const ETIQUETA_URGENCIA: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

const COLOR_URGENCIA: Record<string, ColorChip> = {
  baja: 'default',
  media: 'info',
  alta: 'warning',
  critica: 'error',
};

const ROLES_PERSONAL = ['tecnico', 'enfermeria', 'seguridad', 'limpieza'];
const ROLES_SOLICITANTE = ['solicitante', 'docente'];

const formatearFecha = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '-';

const formatearDuracion = (minutos: number | null): string => {
  if (minutos === null) return '-';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  if (minutos < 1440) return `${(minutos / 60).toFixed(1)} h`;
  return `${(minutos / 1440).toFixed(1)} días`;
};

function mensajeDeError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error ?? 'No se pudo cargar la información del usuario';
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography variant="body1" component="div">
        {valor}
      </Typography>
    </Box>
  );
}

function Cifra({ valor, etiqueta }: { valor: string | number; etiqueta: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
      <Typography variant="h5">{valor}</Typography>
      <Typography variant="body2" color="text.secondary">
        {etiqueta}
      </Typography>
    </Paper>
  );
}

function TablaSolicitudes({ solicitudes }: { solicitudes: SolicitudResumen[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Fecha</TableCell>
            <TableCell>Sala</TableCell>
            <TableCell>Categoría</TableCell>
            <TableCell>Descripción</TableCell>
            <TableCell>Urgencia</TableCell>
            <TableCell>Estado</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {solicitudes.map((s) => (
            <TableRow key={s.id}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatearFecha(s.fecha_creacion)}</TableCell>
              <TableCell>{s.sala}</TableCell>
              <TableCell>{ETIQUETA_CATEGORIA[s.categoria] ?? s.categoria}</TableCell>
              <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.descripcion}
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={ETIQUETA_URGENCIA[s.urgencia] ?? s.urgencia}
                  color={COLOR_URGENCIA[s.urgencia] ?? 'default'}
                />
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={ETIQUETA_ESTADO[s.estado] ?? s.estado}
                  color={COLOR_ESTADO[s.estado] ?? 'default'}
                  variant="outlined"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function UsuarioDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<UsuarioDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const idNumero = Number(id);
  const idValido = Number.isInteger(idNumero) && idNumero > 0;

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    usuarioDetalleService
      .obtener(idNumero)
      .then((datos) => {
        if (!cancelado) setDetalle(datos);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(mensajeDeError(err));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    // Si se sale de la pantalla antes de que responda el servidor, se ignora la respuesta
    return () => {
      cancelado = true;
    };
  }, [idNumero, idValido]);

  const volver = (
    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/usuarios')} sx={{ mb: 2 }}>
      Volver a usuarios
    </Button>
  );

  if (!idValido) {
    return (
      <>
        {volver}
        <Alert severity="error">El identificador del usuario no es válido</Alert>
      </>
    );
  }

  if (cargando) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !detalle) {
    return (
      <>
        {volver}
        <Alert severity="error">{error || 'No se pudo cargar la información del usuario'}</Alert>
      </>
    );
  }

  const { usuario, solicitudes_creadas: creadas, solicitudes_atendidas: atendidas } = detalle;
  const esPersonal = ROLES_PERSONAL.includes(usuario.rol);
  const esSolicitante = ROLES_SOLICITANTE.includes(usuario.rol);
  const iniciales = `${usuario.nombre.charAt(0)}${usuario.apellido.charAt(0)}`.toUpperCase();
  const mostrarCreadas = esSolicitante || creadas.total > 0;
  const mostrarAtendidas = esPersonal || atendidas.total > 0;

  return (
    <>
      {volver}

      <Paper sx={{ p: 3, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 24 }}>{iniciales}</Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">
            {usuario.nombre} {usuario.apellido}
          </Typography>
          <Typography color="text.secondary">{usuario.email}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip color="primary" label={ETIQUETA_ROL[usuario.rol] ?? usuario.rol} />
          {esPersonal && (
            <Chip
              color={usuario.disponible ? 'success' : 'default'}
              variant="outlined"
              label={usuario.disponible ? 'Disponible' : 'No disponible'}
            />
          )}
        </Box>
      </Paper>

      {usuario.rol === 'staff' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Esta cuenta de personal aún no tiene una categoría asignada. Puedes asignarla desde la lista de usuarios.
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Datos de la cuenta
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}>
          <Dato etiqueta="ID" valor={usuario.id} />
          <Dato etiqueta="Correo" valor={usuario.email} />
          <Dato etiqueta="Rol" valor={ETIQUETA_ROL[usuario.rol] ?? usuario.rol} />
          <Dato etiqueta="Fecha de registro" valor={formatearFecha(usuario.fecha_creacion)} />
          {esPersonal && (
            <>
              <Dato etiqueta="Disponibilidad" valor={usuario.disponible ? 'Disponible' : 'No disponible'} />
              <Dato etiqueta="Dispositivos con notificaciones" valor={detalle.dispositivos_notificaciones} />
            </>
          )}
        </Box>
      </Paper>

      {mostrarCreadas && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Solicitudes creadas
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2, mb: 2 }}>
            <Cifra valor={creadas.total} etiqueta="Total" />
            <Cifra valor={creadas.pendientes} etiqueta="Pendientes" />
            <Cifra valor={creadas.atendidas} etiqueta="En progreso" />
            <Cifra valor={creadas.terminadas} etiqueta="Finalizadas" />
          </Box>
          {creadas.recientes.length > 0 ? (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Las 10 más recientes
              </Typography>
              <TablaSolicitudes solicitudes={creadas.recientes} />
            </>
          ) : (
            <Typography color="text.secondary">Este usuario aún no ha creado solicitudes.</Typography>
          )}
        </Paper>
      )}

      {mostrarAtendidas && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Solicitudes atendidas
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2, mb: 2 }}>
            <Cifra valor={atendidas.total} etiqueta="Total" />
            <Cifra valor={atendidas.en_curso} etiqueta="En curso" />
            <Cifra valor={atendidas.terminadas} etiqueta="Finalizadas" />
            <Cifra valor={formatearDuracion(atendidas.minutos_promedio)} etiqueta="Tiempo medio de resolución" />
          </Box>
          {atendidas.recientes.length > 0 ? (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Las 10 más recientes
              </Typography>
              <TablaSolicitudes solicitudes={atendidas.recientes} />
            </>
          ) : (
            <Typography color="text.secondary">Este usuario aún no ha atendido solicitudes.</Typography>
          )}
        </Paper>
      )}

      {!mostrarCreadas && !mostrarAtendidas && (
        <Typography color="text.secondary">Esta cuenta no tiene actividad registrada.</Typography>
      )}
    </>
  );
}
