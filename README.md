# Class Voting App (Tokens únicos + QR)

App mínima para eventos privados en clase:
- Crea encuestas con opciones.
- Genera tokens únicos (links/QR) — **un voto por persona**.
- Resultados en vivo + tabla con nombre y elección.
- Export CSV.

## 0) Requisitos
- Node 18+
- (Opcional) Cuenta gratuita en Render.com o Railway.app para desplegar rápido.

## 1) Instalación local
```bash
npm install
cp .env.example .env
# edita .env -> ADMIN_PASSWORD=... y APP_BASE_URL=http://localhost:3000
npm run seed   # crea encuesta de ejemplo con 5 tokens
npm run dev
```

- Admin: http://localhost:3000/admin?p=TU_PASSWORD
- Encuesta de ejemplo: entra a /admin -> ver tokens -> escanea el QR con tu celular y vota.
- Resultados: http://localhost:3000/results/1

## 2) Despliegue rápido (Render)
1. Sube este ZIP a un repo en GitHub.
2. En Render.com -> New -> Web Service -> conecta el repo.
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Variables de entorno:
   - `ADMIN_PASSWORD` = (tu clave)
   - `APP_BASE_URL` = (la URL que Render te asigne, p. ej. https://tu-app.onrender.com)
6. En la primera vez, visita `/admin?p=TU_PASSWORD` y crea tu encuesta.

*(Railway, Fly.io o Vercel + Node server también funcionan.)*

## 3) Uso en clase (flujo)
- Ve a **/admin** (con `?p=tu_password`).
- Crea la encuesta con opciones y **N tokens** = número de estudiantes.
- Imprime o proyecta los **QR** (o envía los links).
- Cada estudiante abre su QR → ingresa **nombre** + elige opción → **token queda invalidado**.
- Abre **/results/:id** en el videobeam: verás **conteo** y **quién votó**.

## 4) Notas
- Privacidad: el formulario advierte que el nombre y la elección serán públicos.
- Para cerrar manualmente: en `/admin/poll/:id` cambia estado a `closed`.
- Exporta CSV desde el mismo panel.
