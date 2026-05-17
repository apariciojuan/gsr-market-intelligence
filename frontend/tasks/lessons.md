# Lessons — GSR Frontend

Registro de patrones a no repetir. Repasar al inicio de cada sesión.

---

## L1 — Verificación responsive: probar viewport móvil, no solo navegar rutas

**Contexto:** La verificación de la Fase 4 navegó las 14 rutas pero solo en viewport desktop.
El `globals.css` portado del ejemplo tenía `@media (max-width: 768px) { .sidebar { display: none } }`
**sin** ningún botón hamburguesa que lo reemplazara → en móvil el menú quedaba inaccesible.
Lo detectó el usuario, no la verificación.

**Regla:** al portar o tocar layout/CSS, verificar siempre **al menos un viewport móvil** (~390px)
además del desktop. Revisar específicamente que toda la navegación siga siendo alcanzable.
`display: none` en un elemento de navegación es una red flag: exige un reemplazo (drawer + toggle).

---

## L2 — `app/.next` y `app/node_modules` se corrompen con permisos root: es el contenedor Docker

**Contexto:** Durante todo el proyecto, `npm run build` / `npm run dev` en el host fallan
intermitentemente con `EACCES: permission denied, unlink '.../app/.next/server/...'`.

**Causa:** `gsr-project/docker-compose.yml` define un servicio `frontend` que bind-montea
`./frontend/app:/home/app` y corre `next dev` **como root** dentro del contenedor. Ese proceso
root escribe `.next` (y en su día `node_modules`) con propiedad `root` en el directorio
compartido del host, chocando con cualquier `next dev`/`next build` lanzado como `juan`.

**Regla:** en este proyecto, **correr el frontend vía Docker** (`docker compose up -d frontend`
desde `gsr-project/`), que es la forma prevista — el contenedor bind-montea `app/`, así que
recoge los cambios con hot-reload y sirve en `localhost:3000` sin conflicto de permisos.
Si hace falta build/dev en el host: parar el contenedor `frontend` primero y, si `.next` quedó
root-owned, `sudo chown -R juan:juan app/.next` (no hay sudo sin password en el entorno actual,
así que la vía Docker es la práctica).
