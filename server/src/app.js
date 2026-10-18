import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config, supabaseConfigurado } from "./config.js";
import { requiereUsuario } from "./middleware/auth.js";
import { requiereAdmin } from "./middleware/admin.js";
import { comprasRouter } from "./routes/compras.js";
import { productosRouter } from "./routes/productos.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { ventasRouter } from "./routes/ventas.js";

export const app = express();

// Dominio (host) de una dirección web, o "" si no es válida
function dominioDe(direccion) {
  try {
    return new URL(direccion).host;
  } catch {
    return "";
  }
}

// Detrás de Vercel/Render hay un proxy: sin esto el límite de pedidos vería siempre la misma IP
app.set("trust proxy", 1);
app.disable("x-powered-by"); // no avisar qué tecnología usa el servidor

// Seguridad básica
app.use(helmet()); // encabezados de protección
app.use(
  cors((req, callback) => {
    const origen = req.get("origin");
    // Se acepta: sin origen (curl, servidor a servidor), la propia web que sirve la API
    // (mismo dominio, como en Vercel) o una de las webs listadas en CORS_ORIGIN
    const dominio = dominioDe(origen || "");
    const mismoDominio = Boolean(dominio) && (dominio === req.get("x-forwarded-host") || dominio === req.get("host"));
    const permitido = !origen || mismoDominio || config.origenesPermitidos.includes(origen);
    callback(permitido ? null : new Error("Origen no permitido"), { origin: permitido });
  }),
);
app.use(express.json({ limit: "100kb" })); // rechaza cuerpos enormes
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: 120, // 120 pedidos por minuto por IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados pedidos. Esperá un momento y probá de nuevo." },
  }),
);

// Ruta de prueba: sirve para comprobar que el servidor está vivo
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, servicio: "gestion-api", supabaseConfigurado });
});

// Quién soy: devuelve el usuario del token. Sirve para comprobar que el login llega bien al servidor
app.get("/api/me", requiereUsuario, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// Operaciones de stock (todas exigen iniciar sesión)
app.use("/api/ventas", requiereUsuario, ventasRouter);
app.use("/api/compras", requiereUsuario, comprasRouter);
app.use("/api/productos", requiereUsuario, productosRouter);

// Administración de personas: solo para administradores
app.use("/api/admin/usuarios", requiereUsuario, requiereAdmin, usuariosRouter);

// Ruta inexistente
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// Errores no previstos: se registran adentro y se responde algo genérico (sin detalles internos)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.message === "Origen no permitido") return res.status(403).json({ error: err.message });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "El pedido es demasiado grande." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "El cuerpo no es un JSON válido." });
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});
