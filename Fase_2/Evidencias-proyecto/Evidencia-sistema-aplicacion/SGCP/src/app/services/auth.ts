import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Preferences } from '@capacitor/preferences';
import { Observable, switchMap, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rut: string;
  telefono: string;
  rol: string;
  disponible?: boolean;
  aprobado: boolean;
}

interface LoginResponse {
  token: string;
  usuario: Usuario;
}

interface RegistroUsuario {
  nombre: string;
  apellido: string;
  email: string;
  rut: string;
  telefono: string;
  contrasena: string;
  rol: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient) {}

  // Login de usuario.
  login(email: string, contrasena: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, contrasena }).pipe(
      switchMap(async (res) => {
        await Preferences.set({ key: 'auth_token', value: res.token });
        await Preferences.set({ key: 'usuario', value: JSON.stringify(res.usuario) });
        return res; // recién aquí se emite next, con todo ya guardado
      })
    );
  }

  // Registro de usuario.
  register(datos: RegistroUsuario): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/register`,
      datos
    );
  }

  // Reenvío de correo de verificación.
  reenviarVerificacion(email: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(
      `${this.apiUrl}/reenviar-verificacion`,
      { email }
    );
  }

  // Logout.
  async logout() {
    await Preferences.remove({ key: 'auth_token' });
    await Preferences.remove({ key: 'usuario' });
  }

  // Obtener tóken.
  async getToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: 'auth_token' });
    return value;
  }

  // Verificación de autenticación.
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  // Obtener usuario almacenado.
  async getUsuario(): Promise<Usuario | null> {
    const { value } = await Preferences.get({ key: 'usuario' });
    return value ? JSON.parse(value) : null;
  }

  // Obtener rol. Versión async, ya que Preferences no permite acceso síncrono
  async getRol(): Promise<string | null> {
    const usuario = await this.getUsuario();
    return usuario?.rol ?? null;
  }

  // Conexión con verificación de rol en backend-express/routes/auth.js
async obtenerPerfilActual(): Promise<Usuario> {
  const response = await firstValueFrom(
    this.http.get<Usuario & { token?: string }>(`${environment.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${await this.getToken()}` },
    })
  );

  const { token, ...usuario } = response;
  if (token) {
    await Preferences.set({ key: 'auth_token', value: token });
  }
  await Preferences.set({ key: 'usuario', value: JSON.stringify(usuario) });
  return usuario as Usuario;
}
}
