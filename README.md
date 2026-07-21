# ASIS PLUS — SoluAsistencia

Sistema de gestión de asistencias y siniestros para operación de transporte
(combuses / SoluSeguros). Aplicación web progresiva (PWA) en **JavaScript
vanilla** (sin framework ni build) con backend en **Supabase**.

## Módulos principales

- **Registro de asistencias / bandeja de casos** — creación, asignación,
  seguimiento y cierre de siniestros; check-in del asistente en sitio.
- **Terceros involucrados** — datos, fotos, firmas y evidencia por tercero.
- **Evidencias** — fotos del sitio (con marca de agua), croquis del accidente,
  versiones (escrita y de voz) y firmas.
- **Casos por categoría (Seguridad Vial)** — clasificación automática
  (reclamación a favor / en contra, lesiones, prejudiciales, 2251, cerrado),
  tabla profesional, calendario de audiencias, gestión del proceso e informe
  completo exportable a PDF.
- **Contratos legales** — conciliación en sitio (transacción, desistimiento,
  mutuo acuerdo, a favor / en contra) integrada bajo `contratos/`, con firma
  y generación de PDF.
- **Gestión de usuarios y roles** — admin, gestor, asistente y áreas
  (reclamaciones, seguridad vial).

## Estructura

```
verificacion.html      Página principal (SPA)
js/                    Lógica de la aplicación (scripts con carga diferida)
css/styles.css         Estilos
icons/                 Iconos e imágenes de la PWA
contratos/             Módulo de contratos legales (mismo origen y sesión)
supabase/functions/    Edge Functions (p. ej. administración de usuarios)
manifest.json, sw.js   Configuración PWA + service worker
```

## Configuración

La conexión a Supabase vive en [`js/config.js`](js/config.js) y solo contiene
la **clave pública (publishable / anon)**, segura de exponer en el navegador.
La seguridad real de los datos la aplican las **políticas RLS** de la base de
datos. Los secretos de administración (service_role, token de gestión) **nunca**
se guardan en el código; las Edge Functions los leen de variables de entorno.

## Ejecución local

Al ser archivos estáticos, basta servir la carpeta con cualquier servidor HTTP:

```bash
python -m http.server 8000
# luego abrir http://127.0.0.1:8000/verificacion.html
```

---

© SoluSeguros — uso interno.
