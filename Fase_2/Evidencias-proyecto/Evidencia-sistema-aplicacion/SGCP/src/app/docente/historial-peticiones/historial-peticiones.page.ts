//historial-peticiones.page.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SolicitudService } from '../../services/solicitud';
import { Solicitud } from '../../models/solicitud.model';

@Component({
  selector: 'app-historial-peticiones',
  templateUrl: './historial-peticiones.page.html',
  styleUrls: ['./historial-peticiones.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class HistorialPeticionesPage implements OnInit {
  solicitudes: Solicitud[] = [];
  cargando = true;
  error = '';
  cancelandoId: number | null = null;

  private iconos: Record<string, string> = {
    tecnico: 'construct-outline',
    enfermeria: 'medkit-outline',
    seguridad: 'shield-checkmark-outline',
    limpieza: 'sparkles-outline',
  };

  private etiquetasEstado: Record<string, string> = {
    pendiente: 'Pendiente',
    atendida: 'En proceso',
    terminada: 'Resuelta',
    cancelada: 'Cancelada',
  };

  private etiquetasCategoria: Record<string, string> = {
    tecnico: 'Servicio técnico',
    enfermeria: 'Emergencia médica',
    seguridad: 'Seguridad',
    limpieza: 'Limpieza',
  };

  constructor(
    private solicitudService: SolicitudService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController
  ) {}

  async ngOnInit() {
    await this.cargarSolicitudes();
  }

  async cargarSolicitudes() {
    this.cargando = true;
    this.error = '';
    try {
      this.solicitudes = await this.solicitudService.listarMias();
    } catch (err) {
      this.error = 'No se pudo cargar el historial. Intenta de nuevo.';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  iconoPorCategoria(categoria?: string): string {
    return this.iconos[categoria ?? ''] || 'help-circle-outline';
  }

  etiquetaCategoria(categoria?: string): string {
    return this.etiquetasCategoria[categoria ?? ''] || categoria || '';
  }

  etiquetaEstado(estado?: string): string {
    return this.etiquetasEstado[estado ?? ''] || estado || '';
  }

  // =====================================================
  // CANCELAR PETICIÓN (solo si aún no está terminada)
  // =====================================================

  puedeCancelar(estado?: string): boolean {
    return estado === 'pendiente' || estado === 'atendida';
  }

  async cancelar(s: Solicitud) {
    if (this.cancelandoId !== null || s.id == null) return;

    const enProceso = s.estado === 'atendida';

    const confirmacion = await this.alertController.create({
      header: 'Cancelar petición',
      message: enProceso
        ? 'El personal ya está atendiendo esta petición. Si la cancelas, se detendrá la atención. ¿Quieres continuar?'
        : '¿Seguro que quieres cancelar esta petición?',
      buttons: [
        { text: 'No, volver', role: 'cancel' },
        { text: 'Sí, cancelar', role: 'confirm' },
      ],
      backdropDismiss: false,
    });

    await confirmacion.present();
    const { role } = await confirmacion.onDidDismiss();
    if (role !== 'confirm') return;

    this.cancelandoId = s.id;
    this.cdr.detectChanges();

    try {
      await this.solicitudService.cancelar(s.id);
    } catch (err: any) {
      console.error('Error al cancelar la petición:', err);
      await this.mostrarAlerta(
        'No se pudo cancelar',
        err.error?.error || 'Intenta de nuevo en unos momentos.'
      );
    } finally {
      this.cancelandoId = null;
      this.cdr.detectChanges();
    }

    // Se recarga siempre: si falló, puede que el estado haya cambiado mientras tanto
    await this.cargarSolicitudes();
  }

  private async mostrarAlerta(titulo: string, mensaje: string) {
    const alerta = await this.alertController.create({
      header: titulo,
      message: mensaje,
      buttons: ['Entendido'],
    });

    await alerta.present();
    await alerta.onDidDismiss();
  }

  volver() {
    this.router.navigate(['/inicio-docente']);
  }
}