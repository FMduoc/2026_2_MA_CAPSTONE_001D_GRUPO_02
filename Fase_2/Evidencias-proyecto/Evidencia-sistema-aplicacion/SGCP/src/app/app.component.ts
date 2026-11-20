//app.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { CLAVE_CIERRE } from './services/qr-scanner';

// Marca del flujo del docente (la guarda escanear-qr.ts)
const CLAVE_ESCANEO = 'escaneo_en_curso';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
  //imports: [IonApp, IonRouterOutlet]
})
export class AppComponent {
  constructor(private router: Router) {
    this.escucharResultadoRestaurado();
  }

  // Android pudo matar la app mientras la cámara estaba abierta.
  // Capacitor avisa aquí cuando la app renace. Hay dos flujos que usan el escáner:
  //  - Soporte: cierre de una solicitud  -> marca CLAVE_CIERRE   -> /atencion-soporte
  //  - Docente: identificar la sala      -> marca CLAVE_ESCANEO  -> /escanear-qr
  private escucharResultadoRestaurado() {
    App.addListener('appRestoredResult', async (data) => {
      if (data.pluginId !== 'BarcodeScanner' || data.methodName !== 'scan') return;

      const codigo: string | null = data.success
        ? (data.data as any)?.barcodes?.[0]?.rawValue?.trim() || null
        : null;

      const { value: cierreRaw } = await Preferences.get({ key: CLAVE_CIERRE });
      await Preferences.remove({ key: CLAVE_CIERRE });
      await Preferences.remove({ key: CLAVE_ESCANEO });

      // ---- Flujo de soporte: volver a atención con el código recuperado ----
      if (cierreRaw) {
        let solicitudId: number | null = null;
        try {
          solicitudId = Number(JSON.parse(cierreRaw).solicitudId) || null;
        } catch {
          solicitudId = null;
        }

        this.router.navigate(['/atencion-soporte'], {
          queryParams: {
            id: solicitudId,
            ...(codigo ? { codigoRestaurado: codigo } : { interrumpido: 1 }),
          },
          replaceUrl: true,
        });
        return;
      }

      // ---- Flujo del docente (sin cambios) ----
      this.router.navigate(['/escanear-qr'], {
        queryParams: codigo ? { codigoRestaurado: codigo } : { interrumpido: 1 },
        replaceUrl: true,
      });
    });
  }
}