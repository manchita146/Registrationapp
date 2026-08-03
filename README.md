# Registro de Participantes

Aplicacion local para inscribir participantes, registrar actividades y marcar asistencias usando nombre y fecha de nacimiento como identificadores principales. El registro de participantes incluye nivel academico, padre/madre/tutor y condiciones de salud.

## Ejecutar

En este equipo puedes iniciar la app con:

```powershell
.\run.ps1
```

Luego abre:

```text
http://127.0.0.1:8765
```

La base de datos se crea automaticamente en:

```text
data/participants.sqlite3
```

Si prefieres usar Python directamente:

```powershell
python app.py
```

Variables utiles:

```text
PORT=8765
HOST=0.0.0.0
APP_DATA_DIR=data
SCHOOL_ACCESS_CODE=escuela123
COOKIE_SECURE=false
```

## Acceso

La seccion de asistencia puede usarse sin clave. Panel, participantes, actividades y reportes requieren clave de escuela.

Clave inicial:

```text
escuela123
```

Para cambiarla, inicia la app definiendo `SCHOOL_ACCESS_CODE` antes de ejecutar `run.ps1` o `app.py`.

## Publicar en linea

La app esta preparada para proveedores como Render o Railway. Usa SQLite, asi que necesitas almacenamiento persistente para no perder la base de datos cuando el servidor reinicie.

### Render

1. Sube estos archivos a GitHub.
2. En Render crea un **Web Service** conectado al repositorio.
3. Runtime: Python.
4. Build command:

```text
pip install -r requirements.txt
```

5. Start command:

```text
python app.py
```

6. Agrega un Persistent Disk:

```text
Mount path: /var/data
```

7. Agrega variables de entorno:

```text
APP_DATA_DIR=/var/data
SCHOOL_ACCESS_CODE=tu-clave-segura
COOKIE_SECURE=true
```

Render define `PORT` automaticamente.

### Railway

1. Crea un nuevo proyecto desde el repositorio de GitHub.
2. Agrega un Volume al servicio.
3. Monta el volume en:

```text
/var/data
```

4. Agrega variables:

```text
APP_DATA_DIR=/var/data
SCHOOL_ACCESS_CODE=tu-clave-segura
COOKIE_SECURE=true
```

Railway tambien define `PORT` automaticamente.

### Uso desde celular

Cuando el proveedor genere una URL HTTPS, abre esa URL desde el celular. Puedes crear un codigo QR con la URL publica de asistencia para que profesores o participantes la abran rapidamente.

## Reportes disponibles

- Participantes inscritos.
- Actividades registradas con instrumento asignado.
- Actividades registradas con profesor asignado.
- Asistencias por actividad y fecha.
- Filtro de asistencias por actividad.
- Asistencias con profesor asignado.
- Nuevos participantes por periodo, segun fecha de inscripcion.
- Participantes que asisten por primera vez por periodo, segun primera asistencia.
- Exportacion ZIP con CSV de participantes, instrumentos, profesores, actividades y asistencias.
