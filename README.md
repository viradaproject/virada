# VIRADA — prototipo

Central de reservas para un club de remo. Prototipo de interfaz en React (Vite), sin backend ni base de datos — todos los datos viven en memoria del navegador y se pierden al recargar la página.

## Probarlo en local

```bash
npm install
npm run dev
```

Se abre en `http://localhost:5173`.

## Desplegar en Vercel

### Opción A — desde la web de Vercel (sin usar la terminal)

1. Sube esta carpeta a un repositorio de GitHub (crea uno nuevo en github.com, arrastra estos archivos o usa `git push`).
2. Entra en [vercel.com](https://vercel.com) → **Add New → Project**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Vercel detecta automáticamente que es un proyecto **Vite** — no hace falta tocar nada de la configuración (Build Command: `vite build`, Output Directory: `dist`).
5. Pulsa **Deploy**. En 1-2 minutos tienes una URL pública tipo `virada.vercel.app`.

### Opción B — desde la terminal (más rápido si ya tienes Node instalado)

```bash
npm install -g vercel
cd virada-app
vercel
```

Sigue las preguntas en pantalla (crea cuenta si no tienes, elige el nombre del proyecto) y en un minuto te da la URL. Para desplegar actualizaciones después: `vercel --prod`.

## Qué falta para producción real

Este prototipo no tiene base de datos: cada persona que entra ve una sesión en blanco, y todo se borra al recargar. Para un uso real con datos persistentes hace falta:

- Un **backend** con autenticación
- Una **base de datos** (ver el documento técnico `virada-esquema-base-datos.docx` con el esquema completo de tablas)
- Almacenamiento de archivos aparte para las fotos y PDFs (S3, Supabase Storage, etc.)

La vía más rápida para eso es conectar este mismo frontend a **Supabase** (incluye PostgreSQL + autenticación + almacenamiento en un solo servicio, sin montar servidor propio).
