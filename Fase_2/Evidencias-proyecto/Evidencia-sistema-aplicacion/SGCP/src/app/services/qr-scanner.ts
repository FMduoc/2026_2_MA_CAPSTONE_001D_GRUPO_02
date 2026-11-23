//services/qr-scanner.ts
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ModalController } from '@ionic/angular/lazy';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
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
    const nativo = Capacitor.isNativePlatform();

    // En celular se piden los permisos de cámara antes de abrir el escáner.
    // En el navegador, el propio navegador pide el permiso al encender la cámara.
    if (nativo) {
      const permiso = await BarcodeScanner.checkPermissions();
      let camara = permiso.camera;
      if (camara !== 'granted') {
        camara = (await BarcodeScanner.requestPermissions()).camera;
      }
      if (camara !== 'granted') return { estado: 'permiso_denegado' };
    }

    const modal = await this.modalCtrl.create({
      component: QrScannerModalComponent,
      // Celular: modal transparente para ver la cámara detrás. Navegador: modal normal.
      cssClass: nativo ? 'modal-scanner' : undefined,
      showBackdrop: !nativo,
      backdropDismiss: true, // permite cerrar con el botón "atrás" de Android o tocando fuera
    });
    await modal.present();

    const { data } = await modal.onDidDismiss<ResultadoEscaneo>();
    return data ?? { estado: 'cancelado' };
  }
}