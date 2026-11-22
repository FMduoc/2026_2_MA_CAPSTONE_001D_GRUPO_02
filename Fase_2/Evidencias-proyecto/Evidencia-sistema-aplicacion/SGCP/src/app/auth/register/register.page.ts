//register.page.ts
import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';

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

  // Lo que el usuario selecciona visualmente
  tipoCuenta = 'solicitante';

  // Área cuando selecciona Personal
  areaSoporte = 'staff';

  error = '';
  cargando = false;


  tiposCuenta = [
    {
      valor: 'solicitante',
      etiqueta: 'Docente'
    },
    {
      valor: 'staff',
      etiqueta: 'Personal'
    }
  ];


  areasSoporte = [
    {
      valor: 'tecnico',
      etiqueta: 'Servicio técnico'
    },
    {
      valor: 'enfermeria',
      etiqueta: 'Enfermería'
    },
    {
      valor: 'limpieza',
      etiqueta: 'Limpieza'
    }
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
      multiplicador =
        multiplicador === 7 ? 2 : multiplicador + 1;
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
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}


  registrarse() {

    // Evita registros duplicados por doble toque
    if (this.cargando) return;

    this.error = '';

    const nombre =
      this.nombre.trim();

    const apellido =
      this.apellido.trim();

    const email =
      this.email
        .trim()
        .toLowerCase();

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

      this.error =
        'Todos los campos son obligatorios';
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

    if (
      this.tipoCuenta === 'staff' &&
      !this.areaSoporte
    ) {

      this.error =
        'Debes seleccionar un área de soporte';

      return;

    }


    if (
      this.contrasena !==
      this.confirmarContrasena
    ) {

      this.error =
        'Las contraseñas no coinciden';

      return;

    }


    if (this.contrasena.length < 8) {

      this.error =
        'La contraseña debe tener al menos 8 caracteres';

      return;

    }


    // ==========================================
    // DEFINIR ROL REAL PARA EL BACKEND
    // ==========================================

    let rolBackend = 'solicitante';


    if (this.tipoCuenta === 'staff') {

      rolBackend =
        this.areaSoporte;

    }


    this.cargando = true;
    this.cdr.detectChanges();


    this.authService
      .register({

        nombre,
        apellido,
        email,

        rut: rutNormalizado,
        telefono,

        contrasena:
          this.contrasena,

        rol:
          rolBackend

      })
      .subscribe({

        next: () => {

          this.cargando = false;
          this.cdr.detectChanges();

          this.router.navigate(
            ['/login'],
            {
              queryParams: {
                registrado: 'true'
              }
            }
          );

        },


        error: (err) => {

          this.cargando = false;

          if (err.status === 0) {
            // El servidor no respondió (sin red, o el servidor de Render está dormido)
            this.error =
              'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
          } else {
            this.error =
              err.error?.error ||
              'No se pudo completar el registro';
          }

          // Refresca la pantalla: sin esto el botón queda en "Creando cuenta..."
          this.cdr.detectChanges();

        }

      });

  }

}