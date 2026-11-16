
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Chart from 'chart.js/auto';
import type { SolicitudHistorial } from '../services/solicitudService';

type TipoGrafico = 'bar' | 'doughnut';

function contarPor(
  solicitudes: SolicitudHistorial[],
  campo: 'estado' | 'categoria' | 'urgencia'
) {
  return solicitudes.reduce<Record<string, number>>((conteo, solicitud) => {
    const valor = solicitud[campo] || 'Sin especificar';
    conteo[valor] = (conteo[valor] || 0) + 1;
    return conteo;
  }, {});
}

function crearImagenGrafico(
  titulo: string,
  datos: Record<string, number>,
  tipo: TipoGrafico
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 300;

  const etiquetas = Object.keys(datos);
  const valores = Object.values(datos);

  const grafico = new Chart(canvas, {
    type: tipo,
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: titulo,
          data: valores,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: titulo,
          font: { size: 22 },
        },
        legend: {
          display: tipo === 'doughnut',
          position: 'bottom',
        },
      },
      ...(tipo === 'bar'
        ? {
            scales: {
              y: {
                beginAtZero: true,
                ticks: { precision: 0 },
              },
            },
          }
        : {}),
    },
  });

  const imagen = canvas.toDataURL('image/png');
  grafico.destroy();

  return imagen;
}

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generarReportePDF(
  solicitudes: SolicitudHistorial[],
  titulo: string,
  nombreArchivo: string
) {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pendientes = solicitudes.filter(
    (s) => s.estado === 'pendiente'
  ).length;

  const atendidas = solicitudes.filter(
    (s) => s.estado === 'atendida'
  ).length;

  const porEstado = contarPor(solicitudes, 'estado');
  const porCategoria = contarPor(solicitudes, 'categoria');
  const porUrgencia = contarPor(solicitudes, 'urgencia');

  // Encabezado
  pdf.setFontSize(20);
  pdf.text('SGCP - Reporte de solicitudes', 14, 16);

  pdf.setFontSize(13);
  pdf.text(titulo, 14, 25);

  pdf.setFontSize(9);
  pdf.text(
    `Generado el: ${formatearFecha(new Date().toISOString())}`,
    14,
    32
  );

  // Resumen
  pdf.setFontSize(12);
  pdf.text('Resumen general', 14, 43);

  pdf.setFontSize(10);
  pdf.text(`Total de solicitudes: ${solicitudes.length}`, 14, 51);
  pdf.text(`Pendientes: ${pendientes}`, 100, 51);
  pdf.text(`Atendidas: ${atendidas}`, 180, 51);

  // Gráficos
  const graficos = [
    crearImagenGrafico('Solicitudes por estado', porEstado, 'doughnut'),
    crearImagenGrafico('Solicitudes por categoría', porCategoria, 'bar'),
    crearImagenGrafico('Solicitudes por urgencia', porUrgencia, 'bar'),
  ];

  const posicionesY = [61, 111, 161];

  graficos.forEach((imagen, index) => {
    pdf.addImage(imagen, 'PNG', 14, posicionesY[index], 265, 47);
  });

  // Tabla detallada en una página nueva
  pdf.addPage();

  pdf.setFontSize(16);
  pdf.text('Detalle de solicitudes', 14, 16);

  autoTable(pdf, {
    startY: 23,
    head: [[
      'ID',
      'Fecha',
      'Sala',
      'Solicitante',
      'Categoría',
      'Urgencia',
      'Estado',
      'Descripción',
    ]],
    body: solicitudes.map((s) => [
      s.id,
      formatearFecha(s.fecha_creacion),
      s.sala_nombre || '—',
      s.usuario_nombre
        ? `${s.usuario_nombre} ${s.usuario_apellido || ''}`
        : '—',
      s.categoria || '—',
      s.urgencia || '—',
      s.estado || '—',
      s.descripcion || '—',
    ]),
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [35, 75, 120],
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 30 },
      2: { cellWidth: 27 },
      3: { cellWidth: 35 },
      4: { cellWidth: 25 },
      5: { cellWidth: 22 },
      6: { cellWidth: 22 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  pdf.save(nombreArchivo);
}
