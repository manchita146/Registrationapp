# Registro de Participantes

Aplicacion local para inscribir participantes, registrar actividades y marcar asistencias usando nombre y fecha de nacimiento como identificadores principales.

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

## Acceso

La seccion de asistencia puede usarse sin clave. Panel, participantes, actividades y reportes requieren clave de escuela.

Clave inicial:

```text
escuela123
```

Para cambiarla, inicia la app definiendo `SCHOOL_ACCESS_CODE` antes de ejecutar `run.ps1` o `app.py`.

## Reportes disponibles

- Participantes inscritos.
- Actividades registradas con instrumento asignado.
- Actividades registradas con profesor asignado.
- Asistencias por actividad y fecha.
- Asistencias con profesor asignado.
- Nuevos participantes por periodo, segun fecha de inscripcion.
- Participantes que asisten por primera vez por periodo, segun primera asistencia.
- Exportacion ZIP con CSV de participantes, instrumentos, profesores, actividades y asistencias.
