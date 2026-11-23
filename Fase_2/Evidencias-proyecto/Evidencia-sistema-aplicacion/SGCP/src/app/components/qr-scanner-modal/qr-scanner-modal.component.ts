//components/qr-scanner-modal/qr-scanner-modal.component.ts
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
// Solo el tipo: la librería se carga únicamente cuando se escanea desde un navegador
import type { IScannerControls } from '@zxing/browser';

@Component({
  selector: 'app-qr-scanner-modal',
  standalone: true,
  imports: [IonicModule],
  template: `
    @if (esWeb) {
      <!-- Navegador / laptop: cámara web dentro del modal -->
      <div class="web-ui">
        <div class="video-wrapper">
          <video #videoElement autoplay muted playsinline></video>
          <div class="marco-web"></div>
        </div>

        @if (mensaje) {
          <p class="mensaje-web">{{ mensaje }}</p>
        } @else {
          <p class="pista">Centra el QR de la sala dentro del recuadro</p>
        }

        <ion-button color="light" (click)="cancelar()">Cancelar</ion-button>
      </div>
    } @else {
      <!-- Celular: la cámara se ve detrás de la app (startScan) -->
      <div class="scanner-ui">
        <div class="marco"></div>
        <p class="pista">Centra el QR de la sala dentro del recuadro</p>
        <ion-button color="light" (click)="cancelar()">Cancelar</ion-button>
      </div>
    }
  `,
  styles: [`
    /* ---------- Celular ---------- */
    .scanner-ui {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    .marco {
      width: 240px;
      height: 240px;
      border: 3px solid #ffc20e;
      border-radius: 16px;
    }

    /* ---------- Navegador / laptop ---------- */
    .web-ui {
      width: 100%;
      height: 100%;
      min-height: 360px;
      box-sizing: border-box;
      padding: 16px;
      background: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }
    .video-wrapper {
      position: relative;
      width: 100%;
      max-width: 480px;
      aspect-ratio: 4 / 3;
      border-radius: 12px;
      overflow: hidden;
      background: #111;
    }
    .video-wrapper video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .marco-web {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 55%;
      aspect-ratio: 1 / 1;
      transform: translate(-50%, -50%);
      border: 3px solid #ffc20e;
      border-radius: 16px;
      pointer-events: none;
    }
    .mensaje-web {
      margin: 0;
      max-width: 480px;
      text-align: center;
      color: #ffb4a9;
      font-weight: 600;
    }

    /* ---------- Compartido ---------- */
    .pista {
      color: #fff;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
      margin: 0;
      text-align: center;
    }
  `],
})
export class QrScannerModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;

  readonly esWeb = !Capacitor.isNativePlatform();
  mensaje = '';

  private listener?: PluginListenerHandle;
  private controlsWeb?: IScannerControls;
  private cerrado = false;

  constructor(
    private modalCtrl: ModalController,
    private cdr: ChangeDetectorRef
  ) {}

  // Celular: se inicia aquí porque no necesita el <video>
  async ngOnInit() {
    if (!this.esWeb) {
      await this.iniciarNativo();
    }
  }

  // Navegador: se inicia cuando el <video> ya existe en pantalla
  async ngAfterViewInit() {
    if (this.esWeb) {
      await this.iniciarWeb();
    }
  }

  // =====================================================
  // CELULAR (Capacitor ML Kit)
  // =====================================================

  private async iniciarNativo() {
    // Esta clase hace transparente la app para que se vea la cámara detrás
    document.body.classList.add('barcode-scanner-active');

    this.listener = await BarcodeScanner.addListener('barcodesScanned', async (event) => {
      const valor = event.barcodes[0]?.rawValue?.trim();
      if (valor) {
        await this.cerrar({ estado: 'ok', codigo: valor });
      }
    });

    try {
      await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
    } catch (err) {
      console.error('Error al iniciar el escaneo:', err);
      await this.cerrar({ estado: 'error' });
    }
  }

  // =====================================================
  // NAVEGADOR / LAPTOP (cámara web con zxing)
  // =====================================================

  private async iniciarWeb() {
    // getUserMedia solo existe en conexiones seguras (HTTPS o localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      this.mostrarMensaje(
        'La cámara solo funciona en una conexión segura (HTTPS) o en localhost.'
      );
      return;
    }

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const lector = new BrowserQRCodeReader();

      // En laptop usa la webcam; en celular, desde el navegador, prefiere la cámara trasera
      this.controlsWeb = await lector.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        this.videoElement!.nativeElement,
        (result) => {
          const valor = result?.getText()?.trim();
          if (valor) {
            this.cerrar({ estado: 'ok', codigo: valor });
          }
        }
      );

      // Si se cerró el modal mientras la cámara iniciaba, se apaga de inmediato
      if (this.cerrado) {
        this.controlsWeb.stop();
      }
    } catch (err: any) {
      console.error('Error al iniciar la cámara web:', err);

      switch (err?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
        case 'PermissionDeniedError':
          await this.cerrar({ estado: 'permiso_denegado' });
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
        case 'OverconstrainedError':
          this.mostrarMensaje('No se detectó ninguna cámara en este equipo.');
          break;
        case 'NotReadableError':
          this.mostrarMensaje('La cámara está siendo usada por otra aplicación.');
          break;
        default:
          this.mostrarMensaje('No se pudo acceder a la cámara.');
      }
    }
  }

  private mostrarMensaje(texto: string) {
    this.mensaje = texto;
    this.cdr.detectChanges();
  }

  // =====================================================
  // CIERRE Y LIMPIEZA
  // =====================================================

  cancelar() {
    return this.cerrar({ estado: 'cancelado' });
  }

  private async cerrar(resultado: any) {
    if (this.cerrado) return;
    this.cerrado = true;
    await this.limpiar();
    await this.modalCtrl.dismiss(resultado);
  }

  // Apaga la cámara y quita lo que se haya registrado, pase lo que pase
  private async limpiar() {
    this.controlsWeb?.stop();
    this.controlsWeb = undefined;

    if (!this.esWeb) {
      document.body.classList.remove('barcode-scanner-active');
      await this.listener?.remove();
      this.listener = undefined;
      await BarcodeScanner.stopScan().catch(() => {});
    }
  }

  // Cubre el caso en que el modal se cierre con el botón "atrás" o tocando fuera
  ngOnDestroy() {
    this.limpiar();
  }
}