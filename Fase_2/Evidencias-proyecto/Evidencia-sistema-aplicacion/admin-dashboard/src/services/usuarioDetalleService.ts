// src/services/usuarioDetalleService.ts
import api from './api';

export interface UsuarioFicha {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  disponible: boolean;
  fecha_creacion: string;
}

export interface SolicitudResumen {
  id: number;
  sala: string;
  categoria: string;
  urgencia: string;
  estado: string;
  descripcion: string;
  nombre_solicitante?: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string | null;
}

export interface UsuarioDetalle {
  usuario: UsuarioFicha;
  solicitudes_creadas: {
    total: number;
    pendientes: number;
    atendidas: number;
    terminadas: number;
    recientes: SolicitudResumen[];
  };
  solicitudes_atendidas: {
    total: number;
    en_curso: number;
    terminadas: number;
    minutos_promedio: number | null;
    recientes: SolicitudResumen[];
  };
  dispositivos_notificaciones: number;
}

export const usuarioDetalleService = {
  async obtener(id: number): Promise<UsuarioDetalle> {
    const { data } = await api.get<UsuarioDetalle>(`/usuarios/${id}`);
    return data;
  },
};
