import { Router } from "express";
import { z } from "zod";
import { responderErrorDB } from "../errores.js";
import { esquemaId, validar } from "../validacion.js";

export const comprasRouter = Router();

const METODOS = ["Efectivo", "Transferencia", "Tarjeta"];

const esquemaCompra = z
  .object({
    fecha: z.iso.date().optional(), // AAAA-MM-DD; si falta se usa hoy
    proveedor_id: z.number().int().positive().nullish(),
    tipo_comprobante: z.enum(["factura_a", "factura_b", "factura_c", "ticket", "sin_comprobante"]),
    numero_comprobante: z.string().trim().max(40).optional(),
    notas: z.string().trim().max(300).optional(),
    items: z
      .array(
        z
          .object({
            producto_id: z.number().int().positive(),
            cantidad: z.number().int().min(1).max(100000),
            // Costo por unidad, con el IVA incluido
            costo_unitario_con_iva: z.number().min(0).max(1_000_000_000),
            // Si falta se usa la del producto, o la general
            alicuota_iva: z.number().min(0).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    // Si falta, la compra queda "a pagar" (y entonces el proveedor es obligatorio)
    pago: z
      .object({
        metodo: z.enum(METODOS),
        monto: z.number().positive().max(1_000_000_000).optional(), // si falta, se paga todo
        fecha: z.iso.date().optional(),
      })
      .strict()
      .nullish(),
  })
  .strict(); // rechaza campos que no existen (por ejemplo un "total" inventado)

const esquemaPago = z
  .object({
    fecha: z.iso.date().optional(),
    metodo: z.enum(METODOS),
    monto: z.number().positive().max(1_000_000_000),
  })
  .strict();

const esquemaMotivo = z.object({ motivo: z.string().trim().min(1, "Escribí el motivo.").max(200) }).strict();

// POST /api/compras -> registra la compra, suma el stock y actualiza el costo promedio, todo en un solo paso
comprasRouter.post("/", validar({ body: esquemaCompra }), async (req, res) => {
  const b = req.datos.body;
  const { data, error } = await req.db.rpc("registrar_compra", {
    p_fecha: b.fecha ?? null,
    p_proveedor: b.proveedor_id ?? null,
    p_tipo: b.tipo_comprobante,
    p_numero: b.numero_comprobante ?? null,
    p_notas: b.notas ?? null,
    p_items: b.items,
    p_pago: b.pago ?? null,
  });
  if (error) return responderErrorDB(res, error);
  res.status(201).json({ id: data });
});

// POST /api/compras/pagos/:id/anular -> anula un pago (queda registrado, no se borra)
comprasRouter.post("/pagos/:id/anular", validar({ params: esquemaId, body: esquemaMotivo }), async (req, res) => {
  const { error } = await req.db.rpc("anular_pago_compra", { p_pago: req.datos.params.id, p_motivo: req.datos.body.motivo });
  if (error) return responderErrorDB(res, error);
  res.status(204).end();
});

// POST /api/compras/:id/pagos -> registra un pago (parcial o total) de la compra
comprasRouter.post("/:id/pagos", validar({ params: esquemaId, body: esquemaPago }), async (req, res) => {
  const { fecha, metodo, monto } = req.datos.body;
  const { data, error } = await req.db.rpc("registrar_pago_compra", {
    p_compra: req.datos.params.id,
    p_fecha: fecha ?? null,
    p_metodo: metodo,
    p_monto: monto,
  });
  if (error) return responderErrorDB(res, error);
  res.status(201).json({ id: data });
});

// POST /api/compras/:id/anular -> anula la compra: devuelve el stock y restaura el costo (queda registrada, no se borra)
comprasRouter.post("/:id/anular", validar({ params: esquemaId, body: esquemaMotivo }), async (req, res) => {
  const { error } = await req.db.rpc("anular_compra", { p_compra: req.datos.params.id, p_motivo: req.datos.body.motivo });
  if (error) return responderErrorDB(res, error);
  res.status(204).end();
});
