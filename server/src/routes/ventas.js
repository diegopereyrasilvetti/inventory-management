import { Router } from "express";
import { z } from "zod";
import { responderErrorDB } from "../errores.js";
import { esquemaId, validar } from "../validacion.js";

export const ventasRouter = Router();

const esquemaVenta = z
  .object({
    fecha: z.iso.date().optional(), // AAAA-MM-DD; si falta se usa hoy
    metodo: z.enum(["Efectivo", "Transferencia", "Tarjeta"]),
    // "Sin IVA discriminado": la venta se registra completa, pero sin separar el IVA (solo Responsable Inscripto)
    sin_iva: z.boolean().optional(),
    items: z
      .array(
        z
          .object({
            producto_id: z.number().int().positive(),
            cantidad: z.number().int().min(1).max(100000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict(); // rechaza campos que no existen (por ejemplo un "total" inventado)

// POST /api/ventas -> registra la venta y descuenta el stock, todo en un solo paso
ventasRouter.post("/", validar({ body: esquemaVenta }), async (req, res) => {
  const { fecha, metodo, items, sin_iva } = req.datos.body;
  const { data, error } = await req.db.rpc("registrar_venta", {
    p_fecha: fecha ?? null,
    p_metodo: metodo,
    p_items: items,
    // Solo se envía cuando se pide: así las ventas comunes siguen funcionando aunque la migración 11 no esté aplicada
    ...(sin_iva ? { p_sin_iva: true } : {}),
  });
  if (error) return responderErrorDB(res, error);
  res.status(201).json({ id: data });
});

// DELETE /api/ventas/:id -> elimina la venta y devuelve el stock
ventasRouter.delete("/:id", validar({ params: esquemaId }), async (req, res) => {
  const { error } = await req.db.rpc("eliminar_venta", { p_venta: req.datos.params.id });
  if (error) return responderErrorDB(res, error);
  res.status(204).end();
});
