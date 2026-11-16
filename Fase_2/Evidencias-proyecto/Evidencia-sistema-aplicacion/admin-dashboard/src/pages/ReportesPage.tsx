
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material';

import { solicitudService } from '../services/solicitudService';
import { generarReportePDF } from '../utils/generarReportePDF';

type Modalidad = 'periodo' | 'completo' | 'ambos';

export function ReportesPage() {
  const [modalidad, setModalidad] = useState<Modalidad>('ambos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const generarReportes = async () => {
    setError('');
    setMensaje('');

    if (
      (modalidad === 'periodo' || modalidad === 'ambos') &&
      (!fechaDesde || !fechaHasta)
    ) {
      setError('Debes seleccionar ambas fechas para generar el reporte por período.');
      return;
    }

    if (
      (modalidad === 'periodo' || modalidad === 'ambos') &&
      fechaDesde > fechaHasta
    ) {
      setError('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }

    setCargando(true);

    try {
      // Obtenemos el historial una sola vez.
      const solicitudes = await solicitudService.listarHistorial();

      if (modalidad === 'periodo' || modalidad === 'ambos') {
        const inicio = new Date(`${fechaDesde}T00:00:00`);
        const fin = new Date(`${fechaHasta}T23:59:59.999`);

        const solicitudesPeriodo = solicitudes.filter((s) => {
          const fecha = new Date(s.fecha_creacion);
          return fecha >= inicio && fecha <= fin;
        });

        generarReportePDF(
          solicitudesPeriodo,
          `Período: ${fechaDesde} al ${fechaHasta}`,
          `SGCP_Reporte_${fechaDesde}_${fechaHasta}.pdf`
        );
      }

      if (modalidad === 'completo' || modalidad === 'ambos') {
        generarReportePDF(
          solicitudes,
          'Historial completo de solicitudes',
          'SGCP_Reporte_Completo.pdf'
        );
      }

      setMensaje(
        modalidad === 'ambos'
          ? 'Se generaron los dos reportes: período e historial completo.'
          : 'El reporte PDF se generó correctamente.'
      );
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
        'No fue posible generar los reportes. Comprueba tu conexión e inténtalo nuevamente.'
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Reportes PDF
      </Typography>

      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Genera informes estadísticos y detallados de las solicitudes de SGCP.
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 700 }}>
        <Typography variant="h6" gutterBottom>
          Configuración del reporte
        </Typography>

        <FormControl fullWidth sx={{ mb: 3, mt: 2 }}>
          <InputLabel id="modalidad-label">Modalidad</InputLabel>
          <Select
            labelId="modalidad-label"
            value={modalidad}
            label="Modalidad"
            onChange={(e) => setModalidad(e.target.value as Modalidad)}
          >
            <MenuItem value="periodo">Por período seleccionado</MenuItem>
            <MenuItem value="completo">Historial completo</MenuItem>
            <MenuItem value="ambos">Ambas modalidades</MenuItem>
          </Select>
        </FormControl>

        {(modalidad === 'periodo' || modalidad === 'ambos') && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl fullWidth>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Fecha inicial
              </Typography>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={{
                  padding: '12px',
                  fontSize: '16px',
                  border: '1px solid #aaa',
                  borderRadius: '4px',
                }}
              />
            </FormControl>

            <FormControl fullWidth>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Fecha final
              </Typography>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={{
                  padding: '12px',
                  fontSize: '16px',
                  border: '1px solid #aaa',
                  borderRadius: '4px',
                }}
              />
            </FormControl>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Todos los reportes incluirán resumen general, tres gráficos
          estadísticos y una tabla detallada de solicitudes.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mensaje && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {mensaje}
          </Alert>
        )}

        <Button
          variant="contained"
          onClick={generarReportes}
          disabled={cargando}
          fullWidth
        >
          {cargando ? (
            <>
              <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
              Generando...
            </>
          ) : (
            'Generar reporte PDF'
          )}
        </Button>
      </Paper>
    </Box>
  );
}
