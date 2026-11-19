# Resumen del Proyecto — La Chulita (Sistema de Gestión para Bar & Cantina)

---

## 1. Arquitectura General

El sistema implementa una arquitectura **cliente-servidor desacoplada** preparada para ejecutarse en una sola computadora o distribuida en dos equipos dentro de la misma red local (LAN):

- **Backend (`/backend`):** API REST construida con **NestJS 12**, **TypeScript**, **TypeORM** y **MySQL**.
  - Prefijo global `/api`.
  - Escucha en `0.0.0.0:3000` (accesible por `localhost` y por IP local).
  - CORS dinámico configurable mediante `CORS_ORIGIN` en `.env`.
- **Frontend (`/frontend`):** Aplicación SPA construida con **React 19**, **TypeScript**, **Vite 8**, **Tailwind CSS 4**, **React Router** y **Axios**.
  - Consume la API mediante la variable `VITE_API_URL`.
  - Autenticación stateless basada en token JWT almacenado en `localStorage` y enviado en el encabezado `Authorization: Bearer <token>`.

---

## 2. Base de Datos (MySQL — 15 Tablas)

Todas las entidades heredan de una clase base común (`id`, `created_at`, `updated_at`) y utilizan columnas `DECIMAL(10,2)` con transformador numérico automático para evitar errores de precisión con cadenas de MySQL.

### Catálogos y Seguridad
1. **`roles`**: Define los 3 perfiles del sistema (`admin`, `mesero`, `cantinero`).
2. **`users`**: Usuarios del sistema con `email` único, contraseña encriptada con `bcryptjs` (10 rondas) y oculta por defecto (`select: false`).
3. **`categories`**: Categorías de productos del menú (Cervezas, Cócteles, Destilados, Sin alcohol, Botanas).
4. **`payment_methods`**: Métodos de pago (Efectivo, Tarjeta, Transferencia).
5. **`suppliers`**: Catálogo de proveedores.
6. **`bar_tables`**: Mesas del bar con número único, capacidad (1 a 30 personas) y estado (`libre` / `ocupada`).

### Menú, Inventario y Relaciones Muchos a Muchos (N:M)
7. **`products`**: Productos a la venta con precio, categoría y bandera `is_active`.
8. **`ingredients`**: Insumos de bodega con unidad (`ml`, `pza`, `g`), `stock`, `min_stock` y último costo (`cost`).
9. **`ingredient_product`** *(N:M)*: Receta de cada producto (qué insumos lleva y en qué `quantity` por porción), con restricción única compuesta `(ingredient_id, product_id)`.
10. **`ingredient_supplier`** *(N:M)*: Relación entre insumos y proveedores con el último `price` de compra por proveedor, con restricción única compuesta `(ingredient_id, supplier_id)`.

### Operación y Trazabilidad
11. **`orders`**: Cuentas por mesa con mesero asignado, estado (`abierta`, `pagada`, `cancelada`), `subtotal`, `tip`, `total` y `closed_at`.
12. **`order_items`**: Renglones pedidos en cada cuenta con precio congelado al momento de la venta (`unit_price`), `line_total`, notas (`notes`) y estado de preparación (`pendiente` / `listo`).
13. **`purchases`**: Compras registradas a proveedores con monto total.
14. **`purchase_items`**: Detalle de insumos comprados en cada orden de compra.
15. **`inventory_movements`**: Bitácora auditable de cada `entrada`, `salida` o `ajuste` de inventario, vinculada al usuario que la realizó (`user_id`) y al renglón de venta (`order_item_id`) cuando aplica.

### Datos Iniciales (`npm run seed`)
Recrea el esquema y carga 3 usuarios (`admin@bar.com`, `mesero@bar.com`, `cantinero@bar.com`, contraseña `password123`), 3 métodos de pago, 5 categorías, 8 mesas, 12 insumos, 2 proveedores y 10 productos con sus recetas.

---

## 3. Flujo Operativo del Bar

1. **Inicio de sesión (`POST /api/login`):** Valida formato y credenciales, genera un JWT con expiración de 8 horas que solo incluye `{ sub: userId }` y devuelve el usuario con su rol (sin contraseña).
2. **Apertura de mesa (`POST /api/orders`):** Bloquea la mesa con `SELECT ... FOR UPDATE`, verifica que esté `libre`, la cambia a `ocupada` y crea la cuenta para el mesero.
3. **Pedido de productos (`POST /api/orders/:id/items`):** Dentro de una **transacción atómica**:
   - Inserta el renglón con el precio vigente del producto.
   - Bloquea (`FOR UPDATE`) y descuenta cada insumo de la receta del producto.
   - Registra cada salida en `inventory_movements`.
   - Recalcula `subtotal` y `total` de la cuenta.
   - Si algún insumo no alcanza, se revierte toda la transacción automáticamente.
4. **Cola de barra (`GET /api/bar/queue` y `PATCH /api/order-items/:id/ready`):** El cantinero visualiza los productos `pendiente` de cuentas abiertas (FIFO) y los marca como `listo`.
5. **Cobro de cuenta (`POST /api/orders/:id/close`):** Verifica que la cuenta tenga al menos un producto, guarda método de pago y propina, recalcula total, marca la cuenta como `pagada` y libera la mesa.
6. **Cancelación (`POST /api/orders/:id/cancel`):** El mesero solo puede cancelar cuentas vacías; el administrador puede cancelar cuentas con productos y el sistema devuelve al inventario exactamente las cantidades registradas en la bitácora.
7. **Compras y ajustes (`POST /api/purchases`, `POST /api/ingredients/:id/adjust`):** Actualizan el stock bajo bloqueo pesimista, guardan el último precio por proveedor y registran el movimiento en bitácora.
8. **Reporte del día (`GET /api/dashboard`):** Ejecuta 6 consultas en paralelo (`Promise.all`) para mostrar ventas del día, propinas, cuentas cobradas, cuentas abiertas, mesas ocupadas, top 5 productos vendidos e insumos en stock mínimo.

---

## 4. Seguridad y Control de Acceso

- **Guardias globales (`APP_GUARD`):** `JwtAuthGuard` y `RolesGuard` protegen todas las rutas por defecto, exceptuando únicamente `@Public()` en `POST /api/login`.
- **Control de acceso por rol (RBAC):**
  - **Admin:** Control total (catálogos, usuarios, compras, bitácora, dashboard y cancelaciones con productos).
  - **Mesero:** Mesas y gestión/cobro exclusivamente de **sus propias cuentas** (protección Anti-IDOR).
  - **Cantinero:** Cola de barra, marcar pedidos listos y consulta de insumos.
- **Anti-enumeración:** `POST /api/login` responde el mismo error `422` (`"Correo o contraseña incorrectos."`) tanto si el correo no existe como si la contraseña no coincide.
- **Protección contra Mass Assignment:** `whitelist: true` descarta cualquier campo no declarado en el DTO (por ejemplo, impide modificar `stock` al editar un insumo).
- **Consultas seguras:** TypeORM parametrizado + escape de comodines `LIKE` (`%`, `_`, `\`).
- **Auto-protección administrativa:** El administrador no puede eliminar su propio usuario ni cambiar su propio rol (`409 Conflict`).

---

## 5. Capas de Validación

1. **Validación global (`backend/src/main.ts`):** `ValidationPipe` con `whitelist: true`, `transform: true` y estado HTTP `422 Unprocessable Entity`.
2. **DTOs (`backend/src/dto/`):**
   - `auth.dto.ts`: `@IsEmail`, `@IsString`, `@IsNotEmpty`.
   - `catalogs.dto.ts`: longitudes máximas, capacidad de mesa (1–30), contraseña mínima de 8 caracteres, transformación `emptyToNull`.
   - `menu-inventory.dto.ts`: unidades permitidas (`ml`, `pza`, `g`), recetas anidadas con `@ValidateNested`, valores mínimos `>= 0`.
   - `operations.dto.ts`: cantidad por renglón (1–50), propina `>= 0`, compras con mínimo 1 insumo.
3. **Reglas de negocio en controladores (`backend/src/controllers/`):** Validación de stock suficiente, producto activo, mesa libre, cuenta abierta y no vacía, prohibición de insumos repetidos en recetas o compras, y validación de dueño/rol.
4. **Base de datos y entorno (`backend/src/common.ts`, `backend/src/app.module.ts`):** Validación de variables `.env` obligatorias al arrancar y filtro global `DatabaseErrorFilter` que traduce errores nativos de MySQL (`ER_DUP_ENTRY` → `409`, `ER_ROW_IS_REFERENCED` → `409`, `ER_NO_REFERENCED_ROW_2` → `422`).

---

## 6. Pruebas Verificadas

- **Compilación y análisis estático:** `nest build` (backend), `tsc -b` / `vite build` (frontend) y `oxlint` con **0 errores**.
- **Suite automatizada (`backend/test/system.spec.ts`):** **12 / 12 pruebas aprobadas**:
  - Seguridad (JWT, anti-enumeración, RBAC, Anti-IDOR, Mass Assignment, escape `LIKE`).
  - Estabilidad (precisión monetaria IEEE 754, filtro de errores MySQL, CRUDs completos y ciclo de órdenes/barra/compras/cancelación).
  - Concurrencia y estrés:
    - 25 aperturas simultáneas de la misma mesa → **1 creada, 24 conflictos**.
    - 30 pedidos simultáneos por 10 unidades en stock → **10 exitosos, 20 rechazados**, stock nunca negativo (`0`).
    - Ráfaga de **500 operaciones concurrentes** → P95 < 25 ms y 0% errores inesperados.
- **Pruebas HTTP en vivo:** 11/11 escenarios de autenticación (`/api/login`, `/api/me`, `/api/logout`) y preflight CORS desde red local verificados contra el servidor real y MySQL.
