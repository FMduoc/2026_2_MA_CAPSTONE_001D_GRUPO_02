//services/soporte.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface SolicitudSoporte {
  id: number;
  sala_nombre: string;
  nombre_solicitante: string;
  descripcion: string;
  categoria: string;
  urgencia: string;
  estado: string;
  atendido_por: number | null;
  descripcion_trabajo?: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string | null;
}

const CATEGORIAS: Record<string, string> = {
  tecnico: 'Servicio técnico',
  enfermeria: 'Emergencia médica',
  limpieza: 'Limpieza',
  seguridad: 'Seguridad',
};

const URGENCIAS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const etiquetaCategoria = (categoria: string): string => CATEGORIAS[categoria] || categoria;
export const etiquetaUrgencia = (urgencia: string): string => URGENCIAS[urgencia] || urgencia;

@Injectable({ providedIn: 'root' })
export class SoporteService {
  private apiUrl = `${environment.apiUrl}/soporte`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private async headers(): Promise<HttpHeaders> {
    const token = await this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async listarSolicitudes(): Promise<SolicitudSoporte[]> {
    const data = await firstValueFrom(
      this.http.get<SolicitudSoporte[]>(`${this.apiUrl}/solicitudes`, {
        headers: await this.headers(),
      })
    );
    return data || [];
  }

  // Estado actual de una solicitud que este usuario está atendiendo
  async consultarEstado(id: number): Promise<{ id: number; estado: string }> {
    return firstValueFrom(
      this.http.get<{ id: number; estado: string }>(
        `${this.apiUrl}/solicitudes/${id}/estado`,
        { headers: await this.headers() }
      )
    );
  }

  async terminar(id: number, codigoQr: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.apiUrl}/solicitudes/${id}/terminar`,
        { codigo_qr: codigoQr },
        { headers: await this.headers() }
      )
    );
  }

  // Solo se puede guardar sobre una solicitud ya terminada por este mismo usuario
  async guardarDescripcionTrabajo(id: number, descripcionTrabajo: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.apiUrl}/solicitudes/${id}/descripcion-trabajo`,
        { descripcion_trabajo: descripcionTrabajo },
        { headers: await this.headers() }
      )
    );
  }
}