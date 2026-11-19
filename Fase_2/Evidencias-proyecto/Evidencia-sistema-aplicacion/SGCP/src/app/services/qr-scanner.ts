import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { environment } from '../../environments/environment';

export type ResultadoEscaneo =
  | { estado: 'ok'; codigo: string }
  | { estado: 'cancelado' }
  | { estado: 'permiso_denegado' }
  | { estado: 'error' };

@Injectable({ providedIn: 'root' })
export class QrScannerService {
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

    try {
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      const valor = barcodes[0]?.rawValue?.trim();
      return valor ? { estado: 'ok', codigo: valor } : { estado: 'cancelado' };
    } catch (err) {
      const msg = String((err as any)?.message ?? err).toLowerCase();
      return msg.includes('cancel') ? { estado: 'cancelado' } : { estado: 'error' };
    }
  }
}