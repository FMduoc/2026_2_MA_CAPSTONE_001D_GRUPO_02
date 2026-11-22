
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth';
import { environment } from '../../environments/environment';
import { FormsModule } from '@angular/forms';
import { QrScannerService } from '../services/qr-scanner';

@Component({
  selector: 'app-inicio-soporte',
  templateUrl: './inicio-soporte.page.html',
  styleUrls: ['./inicio-soporte.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class InicioSoportePage implements OnInit {
  solicitudes: any[] = [];
  usuario: any = null;
  cargando = false;
  error = '';
  actualizandoDisponibilidad = false;

  // NUEVO: controla la solicitud que se está intentando atender
  atendiendoId: number | null = null;
  terminandoId: number | null = null;

  // Filtro de urgencia
  filtroUrgencia = 'todas';
  opcionesUrgenciaFiltro = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'critica', etiqueta: 'Crítica' },
    { valor: 'alta', etiqueta: 'Alta' },
    { valor: 'media', etiqueta: 'Media' },
    { valor: 'baja', etiqueta: 'Baja' },
  ];

  // Filtro de sala
  filtroSala = 'todas';
  busquedaSala = '';

  private apiUrl = `${environment.apiUrl}/soporte`;

constructor(
  private authService: AuthService,
  private router: Router,
  private http: HttpClient,
  private cdr: ChangeDetectorRef,
  private alertController: AlertController,
  private qrScanner: QrScannerService
) {}

  async ngOnInit() {
    this.usuario = await this.authService.getUsuario();
  }

  async ionViewWillEnter() {
    await this.cargarSolicitudes();
  }

  // =====================================================
  // FILTROS DE SOLICITUDES
  // =====================================================

  get salasDisponibles(): string[] {
    const salas = this.solicitudes
      .map((s) => s.sala_nombre)
      .filter(Boolean);

    return Array.from(new Set(salas)).sort();
  }

  get salasFiltradas(): string[] {
    const termino = this.busquedaSala.trim().toLowerCase();

    if (!termino) return this.salasDisponibles;

    return this.salasDisponibles.filter((s) =>
      s.toLowerCase().includes(termino)
    );
  }

  get hayFiltrosActivos(): boolean {
    return (
      this.filtroUrgencia !== 'todas' ||
      this.filtroSala !== 'todas'
    );
  }

  private aplicarFiltros(lista: any[]): any[] {
    return lista.filter((s) => {
      const pasaUrgencia =
        this.filtroUrgencia === 'todas' ||
        s.urgencia === this.filtroUrgencia;

      const pasaSala =
        this.filtroSala === 'todas' ||
        s.sala_nombre === this.filtroSala;

      return pasaUrgencia && pasaSala;
    });
  }

  get solicitudesPendientes(): any[] {
    const activas = this.solicitudes.filter(
      (solicitud) => solicitud.estado === 'pendiente'
    );

    return this.aplicarFiltros(activas);
  }

  get solicitudesHistorial(): any[] {
    const historial = this.solicitudes.filter(
      (solicitud) => solicitud.estado === 'terminada'
    );

    return this.aplicarFiltros(historial);
  }

  seleccionarFiltroUrgencia(
    valor: string | number | undefined
  ) {
    this.filtroUrgencia =
      valor !== undefined ? String(valor) : 'todas';
  }

  onBuscarSala(
    valor: string | number | null | undefined
  ) {
    this.busquedaSala =
      valor !== null && valor !== undefined
        ? String(valor)
        : '';

    this.filtroSala = 'todas';
  }

  seleccionarSala(sala: string) {
    this.filtroSala = sala;
    this.busquedaSala = sala;
  }

  limpiarFiltroSala() {
    this.filtroSala = 'todas';
    this.busquedaSala = '';
  }

  limpiarFiltros() {
    this.filtroUrgencia = 'todas';
    this.filtroSala = 'todas';
    this.busquedaSala = '';
  }

  // =====================================================
  // AUTENTICACIÓN
  // =====================================================

  private async obtenerHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getToken();

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  // =====================================================
  // CARGAR SOLICITUDES
  // =====================================================

  async cargarSolicitudes() {
    if (this.cargando) return;

    const token = await this.authService.getToken();

    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      const data = await firstValueFrom(
        this.http.get<any[]>(
          `${this.apiUrl}/solicitudes`,
          {
            headers: await this.obtenerHeaders(),
          }
        )
      );

      this.solicitudes = data || [];

    } catch (err) {
      console.error(
        'Error al cargar solicitudes:',
        err
      );

      this.error =
        'No se pudieron cargar las solicitudes';

    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  // =====================================================
  // NUEVO: MODAL DE SOLICITUD NO DISPONIBLE
  // PRUEBA CP-21
  // =====================================================

  private async mostrarModalSolicitudOcupada() {
    const alerta = await this.alertController.create({
      header: 'Solicitud no disponible',
      message:
        'Esta solicitud ya fue tomada por otro técnico. ' +
        'No es posible atenderla porque ya se encuentra asignada.',
      buttons: [
        {
          text: 'Entendido',
          role: 'confirm',
        },
      ],
      backdropDismiss: false,
    });

    await alerta.present();
    await alerta.onDidDismiss();
  }

  // =====================================================
  // ATENDER SOLICITUD
  // PROTECCIÓN DE CONCURRENCIA CP-21
  // =====================================================

  async atenderSolicitud(id: number) {

    // Evitar múltiples intentos mientras se procesa uno
    if (this.atendiendoId !== null) {
      return;
    }

    this.error = '';
    this.atendiendoId = id;
    this.cdr.detectChanges();

    try {

      // El backend decide quién obtiene la solicitud
      await firstValueFrom(
        this.http.patch(
          `${this.apiUrl}/solicitudes/${id}/atender`,
          {},
          {
            headers: await this.obtenerHeaders(),
          }
        )
      );

      // Si responde HTTP 200, el técnico ganó la asignación
      await this.router.navigate(
        ['/atencion-soporte'],
        {
          queryParams: { id },
        }
      );

    } catch (err: any) {

      console.error(
        'Error al atender solicitud:',
        err
      );

      // ===============================================
      // NUEVO: CONFLICTO DE CONCURRENCIA
      // HTTP 409
      // ===============================================

      if (err.status === 409) {

        // Mostrar modal de solicitud ocupada
        await this.mostrarModalSolicitudOcupada();

        // Después de cerrar el modal, actualizar la lista
        await this.cargarSolicitudes();

        return;
      }

      // ===============================================
      // OTROS ERRORES
      // ===============================================

      this.error =
        err.error?.error ||
        'No se pudo atender la solicitud';

      await this.cargarSolicitudes();

    } finally {

      // Permitir nuevos intentos de atención
      this.atendiendoId = null;
      this.cdr.detectChanges();

    }
  }

  // =====================================================
  // TERMINAR SOLICITUD
  // =====================================================

   async terminarSolicitud(id: number) {
    if (this.terminandoId !== null) return;
    this.error = '';

    // 1. Avisar qué se va a pedir
    if (!(await this.confirmarEscaneo())) return;

    // 2. Escanear el QR de la sala
    const resultado = await this.qrScanner.escanear();

    if (resultado.estado === 'cancelado') return;
    if (resultado.estado === 'permiso_denegado') {
      this.error = 'Se requiere permiso de cámara para escanear el código de la sala';
      this.cdr.detectChanges();
      return;
    }
    if (resultado.estado === 'error') {
      this.error = 'No se pudo escanear el código. Intenta de nuevo.';
      this.cdr.detectChanges();
      return;
    }

    // 3. El backend valida que el QR sea el de la sala de esta solicitud
    this.terminandoId = id;
    this.cdr.detectChanges();

    try {
      await firstValueFrom(
        this.http.patch(
          `${this.apiUrl}/solicitudes/${id}/terminar`,
          { codigo_qr: resultado.codigo },
          { headers: await this.obtenerHeaders() }
        )
      );

      await this.mostrarAlerta('Solicitud cerrada', 'La solicitud quedó marcada como terminada.');
      await this.cargarSolicitudes();
    } catch (err: any) {
      console.error('Error al terminar solicitud:', err);

      if (err.status === 422) {
        await this.mostrarAlerta(
          'QR incorrecto',
          'El código escaneado no corresponde a la sala de esta solicitud. ' +
            'Dirígete a la sala indicada y escanea su QR.'
        );
      } else {
        this.error =
          err.error?.error ||
          'No se pudo terminar la solicitud. Puede que ya haya sido actualizada por otro usuario.';
        await this.cargarSolicitudes();
      }
    } finally {
      this.terminandoId = null;
      this.cdr.detectChanges();
    }
  }

  private async confirmarEscaneo(): Promise<boolean> {
    const alerta = await this.alertController.create({
      header: 'Cerrar solicitud',
      message: 'Para marcarla como terminada, escanea el código QR de la sala donde se atendió.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Escanear QR', role: 'confirm' },
      ],
      backdropDismiss: false,
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    return role === 'confirm';
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

  // =====================================================
  // DISPONIBILIDAD
  // =====================================================

  async toggleDisponibilidad(disponible: boolean) {
    this.actualizandoDisponibilidad = true;

    try {
      const result = await firstValueFrom(
        this.http.patch<any>(
          `${this.apiUrl}/disponibilidad`,
          { disponible },
          {
            headers: await this.obtenerHeaders(),
          }
        )
      );

      this.usuario.disponible = result.disponible;

      await this.cargarSolicitudes();

    } catch (err) {

      console.error(
        'Error al actualizar disponibilidad:',
        err
      );

      this.error =
        'No se pudo actualizar tu disponibilidad';

    } finally {

      this.actualizandoDisponibilidad = false;
      this.cdr.detectChanges();

    }
  }

  // =====================================================
  // ETIQUETAS
  // =====================================================

  mostrarCategoria(categoria: string): string {
    const categorias: any = {
      tecnico: 'Servicio técnico',
      enfermeria: 'Emergencia médica',
      limpieza: 'Limpieza',
      seguridad: 'Seguridad',
    };

    return categorias[categoria] || categoria;
  }

  mostrarUrgencia(urgencia: string): string {
    const urgencias: any = {
      baja: 'Baja',
      media: 'Media',
      alta: 'Alta',
      critica: 'Crítica',
    };

    return urgencias[urgencia] || urgencia;
  }

  // =====================================================
  // SOLICITUDES EN ATENCIÓN
  // =====================================================

  get cantidadEnAtencion(): number {
    return this.solicitudes.filter(
      (s) =>
        s.estado === 'atendida' &&
        s.atendido_por === this.usuario?.id
    ).length;
  }

  irAAtencion() {
    this.router.navigate(['/atencion-soporte']);
  }

  // =====================================================
  // HISTORIAL
  // =====================================================

  irAHistorial() {
    this.router.navigate(['/historial-soporte']);
  }

  // =====================================================
  // CERRAR SESIÓN
  // =====================================================

  async cerrarSesion() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
