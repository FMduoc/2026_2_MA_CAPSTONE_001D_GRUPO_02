
import { Component, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { AuthService } from '../../services/auth';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterLink
  ],
})
export class RegisterPage {

  nombre = '';
  apellido = '';
  email = '';

  rut = '';
  telefono = '';

  contrasena = '';
  confirmarContrasena = '';

  tipoCuenta = 'solicitante';
  areaSoporte = 'staff';

  error = '';
  cargando = false;

  // Estado de la pantalla de confirmación
  registroExitoso = false;
  correoEnviado = true;

  tiposCuenta = [
    { valor: 'solicitante', etiqueta: 'Docente' },
    { valor: 'staff', etiqueta: 'Personal' }
  ];

  areasSoporte = [
    { valor: 'tecnico', etiqueta: 'Servicio técnico' },
    { valor: 'enfermeria', etiqueta: 'Enfermería' },
    { valor: 'limpieza', etiqueta: 'Limpieza' }
  ];

  // Normalización de RUT.
  private normalizarRut(rut: string): string {
    return rut
      .replace(/\./g, '')
      .replace(/\s/g, '')
      .toUpperCase();
  }

  // Módulo 11 RUT.
  private validarRut(rut: string): boolean {
    const rutNormalizado = this.normalizarRut(rut);

    if (!/^\d{7,8}-[\dK]$/.test(rutNormalizado)) {
      return false;
    }

    const [cuerpo, digitoIngresado] = rutNormalizado.split('-');
    let suma = 0;
    let multiplicador = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * multiplicador;
      multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }

    const resto = 11 - (suma % 11);
    let digitoCalculado: string;

    if (resto === 11) {
      digitoCalculado = '0';
    } else if (resto === 10) {
      digitoCalculado = 'K';
    } else {
      digitoCalculado = String(resto);
    }

    return digitoCalculado === digitoIngresado;
  }

  // Validación de teléfono.
  private validarTelefono(telefono: string): boolean {
    const digitos = telefono.replace(/\D/g, '');
    return digitos.length >= 8 && digitos.length <= 15;
  }

  constructor(
    private authService: AuthService,
    // Utilizados para cambiar los contenidos de la página de forma dinámica.
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  registrarse() {
    if (this.cargando || this.registroExitoso) return;

    // Evita registros duplicados por doble toque
    if (this.cargando) return;

    this.error = '';

    const nombre = this.nombre.trim();
    const apellido = this.apellido.trim();
    const email = this.email.trim().toLowerCase();

    const rutNormalizado = this.normalizarRut(this.rut);
    const telefono = this.telefono.trim();

    if (
      !nombre ||
      !apellido ||
      !email ||
      !rutNormalizado ||
      !telefono ||
      !this.contrasena ||
      !this.confirmarContrasena ||
      !this.tipoCuenta
    ) {
      this.error = 'Todos los campos son obligatorios';
      return;
    }

    if (!this.validarRut(rutNormalizado)) {
      this.error = 'El RUT ingresado no es válido';
      return;
    }

    if (!this.validarTelefono(telefono)) {
      this.error = 'El teléfono ingresado no es válido';
      return;
    }

    if (this.tipoCuenta === 'staff' && !this.areaSoporte) {
      this.error = 'Debes seleccionar un área de soporte';
      return;
    }

    if (this.contrasena !== this.confirmarContrasena) {
      this.error = 'Las contraseñas no coinciden';
      return;
    }

    if (this.contrasena.length < 8) {
      this.error = 'La contraseña debe tener al menos 8 caracteres';
      return;
    }

    // Definir rol real para el backend.
    let rolBackend = 'solicitante';

    if (this.tipoCuenta === 'staff') {
      rolBackend = this.areaSoporte;
    }

    this.cargando = true;
    this.cdr.detectChanges();

    this.authService.register({
      nombre,
      apellido,
      email,
      rut: rutNormalizado,
      telefono,
      contrasena: this.contrasena,
      rol: rolBackend
    })
    .pipe(
      finalize(() => {
        this.ngZone.run(() => {
          this.cargando = false;
          this.cdr.detectChanges();
        });
      })
    )
    .subscribe({
      next: (respuesta: any) => {
        this.ngZone.run(() => {
          this.correoEnviado = respuesta?.correoEnviado !== false;
          this.registroExitoso = true;
          this.error = '';

          // Actualización inmediata de la pantalla.
          this.cdr.detectChanges();
        });
      },

      error: (err) => {
        console.error('Error al registrar usuario:', err);

        this.ngZone.run(() => {
          const mensaje =
            typeof err.error === 'string'
              ? err.error
              : err.error?.error || err.error?.message;

          if (err.error?.codigo === 'EMAIL_DUPLICADO') {
            this.error = 'Ese email ya está registrado';
          } else if (err.error?.codigo === 'RUT_DUPLICADO') {
            this.error = 'Ese RUT ya está registrado';
          } else if (err.status === 0) {
            this.error = 'No se pudo conectar con el servidor. Inténtalo nuevamente.';
          } else {
            this.error =
              err.error?.error ||
              'No se pudo completar el registro. Inténtalo nuevamente.';
          }

          // Actualización inmediata del mensaje de error.
          this.cdr.detectChanges();
        });
      }
    });
  }
}
