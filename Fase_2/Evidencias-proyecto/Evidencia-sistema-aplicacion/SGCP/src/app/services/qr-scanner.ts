//services/qr-scanner.ts
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ModalController } from '@ionic/angular/lazy';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { environment } from '../../environments/environment';
import { QrScannerModalComponent } from '../components/qr-scanner-modal/qr-scanner-modal.component';

export type ResultadoEscaneo =
  | { estado: 'ok'; codigo: string }
  | { estado: 'cancelado' }
  | { estado: 'permiso_denegado' }
  | { estado: 'error' };

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  constructor(private modalCtrl: ModalController) {}

  async escanear(): Promise<ResultadoEscaneo> {
    // En el navegador solo se permite en desarrollo, para poder probar sin celular
    if (!Capacitor.isNativePlatform()) {
      if (!environment.production) {
        const codigo = window.prompt('Código QR de la sala (solo desarrollo)')?.trim();
        return codigo ? { estado: 'ok', codigo } : { estado: 'cancelado' };
      }
      return { estado: 'error' };
    }

    const permiso = await BarcodeScanner.checkPermissions();
    let camara = permiso.camera;
    if (camara !== 'granted') {
      camara = (await BarcodeScanner.requestPermissions()).camera;
    }
    if (camara !== 'granted') return { estado: 'permiso_denegado' };

    // La cámara corre dentro de la propia app (startScan), sin abrir otra Activity
    const modal = await this.modalCtrl.create({
      component: QrScannerModalComponent,
      cssClass: 'modal-scanner',
      showBackdrop: false,
      backdropDismiss: true, // permite cerrar con el botón "atrás" de Android
    });
    await modal.present();

    const { data } = await modal.onDidDismiss<ResultadoEscaneo>();
    return data ?? { estado: 'cancelado' };
  }
}