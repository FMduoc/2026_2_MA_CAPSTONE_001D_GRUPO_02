import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { ModalController } from '@ionic/angular/lazy';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';

@Component({
  selector: 'app-qr-scanner-modal',
  standalone: true,
  imports: [IonicModule],
  template: `
    <div class="scanner-ui">
      <div class="marco"></div>
      <p class="pista">Centra el QR de la sala dentro del recuadro</p>
      <ion-button color="light" (click)="cancelar()">Cancelar</ion-button>
    </div>
  `,
  styles: [`
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
    .pista {
      color: #fff;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
      margin: 0;
    }
  `],
})
export class QrScannerModalComponent implements OnInit, OnDestroy {
  private listener?: PluginListenerHandle;
  private cerrado = false;

  constructor(private modalCtrl: ModalController) {}

  async ngOnInit() {
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

  cancelar() {
    return this.cerrar({ estado: 'cancelado' });
  }

  private async cerrar(resultado: any) {
    if (this.cerrado) return;
    this.cerrado = true;
    await this.limpiar();
    await this.modalCtrl.dismiss(resultado);
  }

  // Apaga la cámara y quita el listener, pase lo que pase
  private async limpiar() {
    document.body.classList.remove('barcode-scanner-active');
    await this.listener?.remove();
    this.listener = undefined;
    await BarcodeScanner.stopScan().catch(() => {});
  }

  // Cubre el caso en que el modal se cierre con el botón "atrás" de Android
  ngOnDestroy() {
    this.limpiar();
  }
}