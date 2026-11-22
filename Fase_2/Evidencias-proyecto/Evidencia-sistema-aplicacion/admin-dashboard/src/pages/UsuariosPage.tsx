// src/pages/UsuariosPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Box,
  Button
} from '@mui/material';
import { usuarioService, type Usuario } from '../services/usuariosService';

const ROLES_ASIGNABLES = [
  { valor: 'tecnico', etiqueta: 'Soporte técnico' },
  { valor: 'enfermeria', etiqueta: 'Enfermería' },
  { valor: 'limpieza', etiqueta: 'Limpieza' },
  { valor: 'seguridad', etiqueta: 'Seguridad' },
];

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const data = await usuarioService.listar();
      setUsuarios(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudieron cargar los usuarios');
    } finally {
      setCargando(false);
    }
  };

  const cambiarRol = async (id: number, nuevoRol: string) => {
    setActualizandoId(id);
    try {
      const actualizado = await usuarioService.actualizarRol(id, nuevoRol);
      // Actualiza solo esa fila en el estado local, sin recargar toda la tabla
      setUsuarios((prev) => prev.map((u) => (u.id === id ? actualizado : u)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo actualizar el rol');
    } finally {
      setActualizandoId(null);
    }
  };

  if (cargando) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Gestión de usuarios
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rol actual</TableCell>
              <TableCell>Asignar rol</TableCell>
              <TableCell>Ficha de usuario</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {usuarios.map((usuario) => (
              <TableRow key={usuario.id}>
                <TableCell>{usuario.nombre} {usuario.apellido}</TableCell>
                <TableCell>{usuario.email}</TableCell>
                <TableCell>
                  <Chip
                    label={usuario.rol}
                    color={usuario.rol === 'staff' ? 'warning' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {usuario.rol === 'solicitante' || usuario.rol === 'administrador' ? (
                    <Typography variant="body2" color="text.secondary">
                      No aplica
                    </Typography>
                  ) : (
                    <Select
                      size="small"
                      value={ROLES_ASIGNABLES.some((r) => r.valor === usuario.rol) ? usuario.rol : ''}
                      displayEmpty
                      disabled={actualizandoId === usuario.id}
                      onChange={(e) => cambiarRol(usuario.id, e.target.value)}
                      sx={{ minWidth: 180 }}
                    >
                      <MenuItem value="" disabled>
                        Selecciona un rol
                      </MenuItem>
                      {ROLES_ASIGNABLES.map((r) => (
                        <MenuItem key={r.valor} value={r.valor}>
                          {r.etiqueta}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(`/usuarios/${usuario.id}`)}
                  >
                    Ver ficha
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}