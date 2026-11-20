//atencion-soporte.page.ts
import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { QrScannerService } from '../services/qr-scanner';
import {
  SoporteService,
  SolicitudSoporte,
  etiquetaCategoria,
  etiquetaUrgencia,
} from '../services/soporte';

@Component({
  selector: 'app-atencion-soporte',
  templateUrl: './atencion-soporte.page.html',
  styleUrls: ['./atencion-soporte.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AtencionSoportePage {
  solicitudes: SolicitudSoporte[] = [];
  usuarioId: number | null = null;
  idDestacado: number | null = null;
  cargando = false;
  terminandoId: number | null = null;
  error = '';

  // Se exponen para poder usarlas desde el template
  readonly etiquetaCategoria = etiquetaCategoria;
  readonly etiquetaUrgencia = etiquetaUrgencia;

  constructor(
    private authService: AuthService,
    private soporteService: SoporteService,
    private qrScanner: QrScannerService,
    private alertController: AlertController,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  // Ionic mantiene las páginas en caché: ngOnInit solo corre la primera vez,
  // ionViewWillEnter corre cada vez que la pantalla vuelve a mostrarse.
  async ionViewWillEnter() {
    const usuario = await this.authService.getUsuario();
    this.usuarioId = usuario?.id ?? null;

    const idParam = this.route.snapshot.queryParamMap.get('id');
    this.idDestacado = idParam ? Number(idParam) : null;

    await this.cargar();
  }

  // Solicitudes que este usuario aceptó y aún no termina.
  // La que se acaba de aceptar (si viene en la URL) se muestra primero.
  get enAtencion(): SolicitudSoporte[] {
    return this.solicitudes
      .filter((s) => s.estado === 'atendida' && s.atendido_por === this.usuarioId)
      .sort((a, b) => Number(b.id === this.idDestacado) - Number(a.id === this.idDestacado));
  }

  async cargar() {
    if (this.cargando) return;

    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      this.solicitudes = await this.soporteService.listarSolicitudes();
    } catch (err) {
      console.error('Error al cargar solicitudes en atención:', err);
      this.error = 'No se pudieron cargar las solicitudes';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  // =====================================================
  // TERMINAR SOLICITUD (requiere escanear el QR de la sala)
  // =====================================================

  async terminar(id: number) {
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
      await this.soporteService.terminar(id, resultado.codigo);

      await this.mostrarAlerta(
        'Solicitud cerrada',
        'La solicitud quedó marcada como terminada.'
      );
    } catch (err: any) {
      console.error('Error al terminar solicitud:', err);

      if (err.status === 422) {
        await this.mostrarAlerta(
          'QR incorrecto',
          'El código escaneado no corresponde a la sala de esta solicitud. ' +
            'Dirígete a la sala indicada y escanea su QR.'
        );
      } else {
        this.error = err.error?.error || 'No se pudo terminar la solicitud.';
      }
    } finally {
      this.terminandoId = null;
      this.cdr.detectChanges();
    }

    // Se recarga siempre: si falló, puede que otro usuario ya la haya modificado
    await this.cargar();
  }

  private async confirmarEscaneo(): Promise<boolean> {
    const alerta = await this.alertController.create({
      header: 'Cerrar solicitud',
      message:
        'Para marcarla como terminada, escanea el código QR de la sala donde se atendió.',
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

  volverAPendientes() {
    this.router.navigate(['/inicio-soporte']);
  }
}