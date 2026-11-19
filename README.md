# Gestión de Stock

Aplicación web para que una empresa pequeña organice su stock: inventario, catálogo de productos, proveedores, ventas, gastos y balances, con alertas cuando algo se está agotando.

🔗 **Demo:** https://inventory-management-sigma-henna.vercel.app/

## Qué incluye

- **Acceso por invitación.** No hay registro público: el administrador crea las cuentas desde el panel. Cada cuenta tiene un rol (`admin` o `usuario`) y puede estar activa o desactivada.
- **Una sola empresa.** Todas las personas con cuenta activa ven y editan los mismos productos, proveedores, ventas y gastos. Los datos no se separan por usuario.
- **Panel:** resumen con alertas e índice de crecimiento, inventario, productos, documentación, proveedores, ventas y balances.
- **Alertas de stock** cuando un producto queda por debajo de su mínimo o se agota.
- **Operaciones de stock "todo o nada".** Vender, ajustar stock y eliminar una venta se hacen en un solo paso; si algo falla no queda nada a medias, y cada cambio de stock queda registrado en un historial de movimientos.
- **Mi perfil:** cada persona ve sus datos y cambia su propia contraseña. Quien la olvidó la recupera por email.
- **Personas (solo administradores):** crear cuentas, cambiar nombre y rol, desactivar, poner una contraseña nueva o eliminar. Se abre desde el menú que aparece al tocar el nombre, arriba a la derecha.

## Tecnologías

| Parte | Tecnología |
|---|---|
| Web | React 19, React Router, Vite, Tailwind CSS 4 |
| Cuentas | Supabase Auth |
| Base de datos | PostgreSQL (Supabase) con seguridad por fila (RLS) |
| API | Node.js + Express 5, zod (validación), helmet, CORS, límite de pedidos |
| Publicación | Vercel (la web y la API en el mismo proyecto) |

## Cómo se conectan las partes

```
Navegador (React)
   ├── Cuentas, lecturas, proveedores, productos, gastos ─► Supabase (Auth + PostgreSQL, protegido por RLS)
   └── Ventas, stock y panel Personas ───────────────────► API Express (/api) ─► PostgreSQL
                                                                   └─ Personas: usa la clave "secret" de Supabase
```

- La web habla **directo con Supabase** para iniciar sesión y para leer o guardar proveedores, productos y gastos. Las reglas de la base deciden quién puede qué.
- Las operaciones de **stock y ventas** pasan por la **API**: verifica el login, valida los datos y llama a funciones de PostgreSQL que se ejecutan completas o no se ejecutan. El precio y el total de una venta los calcula el servidor con los datos de la base, nunca el navegador.
- El panel **Personas** también pasa por la API, porque crear cuentas o cambiar contraseñas exige la clave `secret` de Supabase, que **solo vive en el servidor**.
- Salvo en Personas, la API usa el **token de cada persona** para hablar con la base, así las reglas siguen valiendo.

## Roles y permisos

| | Administrador | Usuario |
|---|---|---|
| Ver y editar inventario, productos, proveedores, ventas, gastos y balances | ✅ | ✅ |
| Cambiar su propia contraseña (Mi perfil) | ✅ | ✅ |
| Crear, editar, desactivar y eliminar cuentas; poner contraseñas | ✅ | ❌ |

- Una cuenta **sin perfil** o **desactivada** no ve ni modifica nada: el panel le muestra "Tu cuenta no tiene acceso".
- Nadie puede desactivarse, quitarse el rol de administrador ni eliminarse a sí mismo, y la base **nunca deja a la empresa sin un administrador activo**.
- Al eliminar una cuenta se **conserva todo lo que esa persona cargó** (productos, ventas, gastos).

## Estructura

```
├── index.html            # Único HTML (monta la app de React)
├── vite.config.js        # Vite; en desarrollo reenvía /api al servidor
├── vercel.json           # /api -> función de la API; el resto -> index.html
├── api/index.js          # Entrada de la API en Vercel (usa server/src/app.js)
├── public/images/        # Logo e imágenes
├── supabase/             # Scripts SQL de la base de datos (ver "Base de datos")
├── server/               # API Express
│   └── src/
│       ├── app.js            # Seguridad, rutas y manejo de errores
│       ├── config.js         # Variables de entorno
│       ├── supabase.js       # Clientes de Supabase (del usuario y de administración)
│       ├── validacion.js     # Validación de datos (zod)
│       ├── errores.js        # Traducción de errores a respuestas claras
│       ├── middleware/       # auth.js (exige login), admin.js (exige ser admin)
│       └── routes/           # ventas.js, productos.js, usuarios.js
└── src/                  # Web (React)
    ├── main.jsx, App.jsx     # Entrada y rutas
    ├── context/AuthContext.jsx   # Sesión y perfil de la persona
    ├── lib/                  # supabase.js, api.js (llama a la API), errores, usuario
    ├── store/                # Acceso a los datos y caché de consultas
    ├── hooks/                # useTitulo, useAviso
    ├── components/           # RutaPrivada, RutaAdmin, MenuUsuario, Icono, CampoPassword, ...
    └── pages/                # Inicio, acceso, recuperar contraseña y secciones del panel
```

### Rutas de la web

| Ruta | Pantalla |
|---|---|
| `/` | Página de inicio |
| `/login` | Iniciar sesión |
| `/recuperar`, `/nueva-password` | Recuperar contraseña por email |
| `/dashboard` | Resumen (privada, exige cuenta activa) |
| `/dashboard/alertas`, `inventario`, `productos`, `documentacion`, `proveedores`, `ventas`, `balances` | Secciones del panel |
| `/dashboard/perfil` | Mi perfil y cambio de contraseña |
| `/dashboard/usuarios` | Personas (solo administradores) |

### API

Todas las rutas, salvo `health`, exigen `Authorization: Bearer <token de Supabase>`.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/health` | Pública | Comprueba que el servidor está vivo |
| `GET /api/me` | Con sesión | Devuelve el usuario del token |
| `POST /api/ventas` | Con sesión | Registra una venta y descuenta el stock. Cuerpo: `{ fecha?, metodo, items: [{ producto_id, cantidad }] }` |
| `DELETE /api/ventas/:id` | Con sesión | Elimina una venta y devuelve el stock |
| `POST /api/productos/:id/stock` | Con sesión | Suma o resta stock. Cuerpo: `{ cantidad, motivo? }` |
| `GET /api/admin/usuarios` | Admin | Lista las personas |
| `POST /api/admin/usuarios` | Admin | Crea una cuenta. Cuerpo: `{ email, nombre, password, rol? }` |
| `PATCH /api/admin/usuarios/:id` | Admin | Cambia `nombre`, `rol` o `activo` |
| `POST /api/admin/usuarios/:id/password` | Admin | Pone una contraseña nueva. Cuerpo: `{ password }` |
| `DELETE /api/admin/usuarios/:id` | Admin | Elimina la cuenta |

Errores: `400` datos inválidos, `401` sin sesión, `403` sin permiso u origen no permitido, `404` no encontrado, `409` conflicto (stock insuficiente, email repetido, último administrador), `503` falta configurar algo en el servidor.

## Puesta en marcha

Requisitos: Node.js 22 o superior, [Yarn](https://classic.yarnpkg.com/) 1.x y un proyecto de Supabase. El proyecto usa solo Yarn: no uses npm ni pnpm.

### 1. Instalar

```
yarn install
```

Instala la web y la API juntas (la carpeta `server/` es un *workspace* del mismo proyecto, por eso el `package.json` de la raíz es `private`). Genera un único `yarn.lock` en la raíz.

### 2. Base de datos

En Supabase, en **SQL Editor**, ejecutá **en este orden** (cada archivo se puede volver a ejecutar sin problema):

| Archivo | Para qué |
|---|---|
| `supabase/01_tablas.sql` | Crea las tablas |
| `supabase/02_seguridad.sql` | Reglas de seguridad iniciales |
| `supabase/03_funciones.sql` | Operaciones de stock "todo o nada" |
| `supabase/04_perfiles.sql` | Perfiles y roles |
| `supabase/05_datos_compartidos.sql` | Datos compartidos por toda la empresa |
| `supabase/06_proteccion_usuarios.sql` | Protecciones al borrar o cambiar personas |

Después, **elegí quién es el primer administrador**, con el email de una cuenta que ya exista:

```sql
update public.perfiles set rol = 'admin' where email = 'tu-email@ejemplo.com';
```

A partir de ahí, las demás cuentas se crean desde el panel **Personas**.

### 3. Variables de entorno

**Web**, archivo `.env` en la raíz (copiá `.env.example`):

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publishable
```

**API**, archivo `server/.env` (copiá `server/.env.example`):

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=tu-clave-publishable
SUPABASE_SERVICE_ROLE_KEY=tu-clave-secret
```

- `ANON_KEY` es la clave **publishable** (empieza con `sb_publishable_`): es pública por diseño.
- `SUPABASE_SERVICE_ROLE_KEY` es la clave **secret** (empieza con `sb_secret_`) y **solo se usa para el panel Personas**. Da acceso total a la base: va únicamente en `server/.env` y en las variables de Vercel como *Secret*; **nunca** en la web, en capturas ni en el repositorio. Sin ella todo funciona igual, salvo ese panel.
- Los archivos `.env` no se suben a git.

### 4. Configurar Supabase

En **Authentication**:
- **Sign In / Providers → User Signups:** desactivá **Allow new users to sign up**. Es lo que impide que cualquiera se registre; las cuentas las crea el administrador.
- **URL Configuration:** poné la dirección de la web publicada en *Site URL*, y agregá `/nueva-password` de la web publicada y de `http://localhost:5173` en *Redirect URLs*.

### 5. Correr en tu computadora

Se necesitan **dos terminales**:

```
# Terminal 1: la API (http://localhost:3001)
cd server
yarn dev

# Terminal 2: la web (http://localhost:5173)
yarn dev
```

La web reenvía las llamadas a `/api` hacia la API automáticamente. Para generar la versión de producción de la web: `yarn build`.

## Publicar en Vercel

La web y la API se publican juntas desde el mismo proyecto. En **Settings → Environment Variables** cargá:

| Variable | Entornos | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Todos | La web |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Todos | La API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo Production**, tipo **Secret** | Panel Personas |
| `CORS_ORIGIN` *(opcional)* | Todos | Otras webs autorizadas a llamar a la API (la propia web ya está permitida) |

Después de cargar o cambiar variables hay que volver a desplegar (**Deployments → ⋯ → Redeploy**).

Como `SUPABASE_SERVICE_ROLE_KEY` está solo en Production, las versiones de prueba (Preview) no tienen el panel Personas: ahí responde que la administración no está configurada. Es a propósito.

## Seguridad

- **Reglas de la base (RLS):** solo las cuentas con perfil activo acceden a los datos, y solo la administración puede ver y modificar los perfiles de todos. No depende de lo que haga la web.
- **API:** exige un token válido de Supabase en cada pedido, valida todos los datos antes de tocar la base y rechaza campos que no corresponden. Las rutas de administración comprueban además que la persona sea administradora.
- **Contraseñas:** las guarda y protege Supabase (hash bcrypt); ni la web ni la API las almacenan.
- **Registro cerrado:** con *sign-ups* desactivados en Supabase, nadie puede crear una cuenta por su cuenta ni llamando directo a Supabase.
- **Protecciones del servidor:** encabezados de seguridad (helmet), CORS restringido, límite de 120 pedidos por minuto por IP y tamaño máximo de 100 KB por pedido. Los errores internos no muestran detalles.
- En Vercel la API corre como función serverless, por lo que el límite de pedidos se aplica por instancia y es más flojo que en un servidor fijo.

## Limitaciones conocidas

- **Reportes** y **Configuración** (en el menú del usuario) y la sección **Documentación** todavía son pantallas de muestra.
- El **índice de crecimiento** del Resumen guarda su historial en el navegador de cada persona, no en la base.
- Los datos que se hubieran cargado antes de pasar a la base de datos (versión anterior, guardada en el navegador) no se migraron automáticamente.
- Los permisos son los de la tabla de arriba: todas las personas activas pueden hacer todo lo operativo, incluido eliminar productos y ventas. Si hiciera falta, se pueden restringir por rol.

## Diseño

Responsive (celular, tablet y escritorio), con paleta clara en tonos crema, marrón y blanco. En celular y tablet, el nombre de la persona y su menú de opciones quedan centrados en el encabezado, separados de la hamburguesa.

## Modo oscuro

Hay modo claro y oscuro. Por defecto sigue la preferencia del sistema y la persona puede cambiarlo desde el menú de usuario (o el encabezado de inicio y acceso); la elección se recuerda en el navegador. Detalles en [docs/modo-oscuro.md](docs/modo-oscuro.md).
