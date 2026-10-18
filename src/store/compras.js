import { useMemo } from "react";
import { api } from "../lib/api.js";
import { estadoPagoCompra, redondear, TIPOS_COMPROBANTE } from "../lib/impuestos.js";
import { db, guardar } from "./db.js";
import { invalidar, useConsulta } from "./consultas.js";
import { CLAVE_PRODUCTOS } from "./productos.js";

const CLAVE_COMPRAS = "compras";

const SELECT =
  "id,fecha,proveedor_id,proveedor_nombre,tipo_comprobante,numero_comprobante,notas,condicion_fiscal,total,neto,iva,credito_fiscal,estado,anulada_en,motivo_anulacion,created_at," +
  "compra_items(id,producto_id,sku,nombre,cantidad,costo_unitario_con_iva,alicuota_iva,total,neto,iva,credito_fiscal,costo_unitario)," +
  "compra_pagos(id,fecha,metodo,monto,estado,anulado_en,motivo_anulacion,created_at)";

// Si todavía no se ejecutó 10_compras.sql las tablas no existen: la pantalla avisa y el resto de la app sigue igual
let tablasDisponibles = true;

async function pedir() {
  const r = await db().from("compras").select(SELECT).order("id", { ascending: false });
  if (!r.error) {
    tablasDisponibles = true;
    return r.data;
  }
  if (r.error.code === "42P01" || r.error.code === "PGRST205") {
    tablasDisponibles = false;
    return [];
  }
  throw r.error;
}

/**
 * Compras. Se leen directo de Supabase (solo lectura); todo lo que cambia pasa por la API, que ejecuta
 * funciones "todo o nada" en la base (suma stock, actualiza el costo promedio, valida pagos...).
 *
 * compras: [{ id, fecha, proveedorId, proveedor, tipo, tipoTexto, numero, notas, condicionFiscal, total, neto, iva,
 *   creditoFiscal, estado: 'activa'|'anulada', motivoAnulacion, items: [...], pagos: [...],
 *   pagado (pagos NO anulados), saldo, estadoPago: 'a_pagar'|'parcial'|'pagada'|'anulada' }]
 * deudaPorProveedor: Map(proveedorId -> lo que se les debe, sin contar compras anuladas)
 * registrar(datos), pagar(id, {fecha, metodo, monto}), anularPago(id, motivo), anular(id, motivo): devuelven true/false.
 */
export function useCompras() {
  const { datos, cargando } = useConsulta(CLAVE_COMPRAS, pedir);

  const compras = useMemo(
    () =>
      datos.map((c) => {
        const pagos = (c.compra_pagos || [])
          .map((p) => ({
            id: p.id,
            fecha: p.fecha,
            metodo: p.metodo,
            monto: Number(p.monto),
            estado: p.estado,
            motivoAnulacion: p.motivo_anulacion || "",
            creado: p.created_at,
          }))
          .sort((a, b) => a.id - b.id);
        const total = Number(c.total);
        const pagado = redondear(pagos.filter((p) => p.estado === "activo").reduce((s, p) => s + p.monto, 0));
        return {
          id: c.id,
          fecha: c.fecha,
          proveedorId: c.proveedor_id,
          proveedor: c.proveedor_nombre || "",
          tipo: c.tipo_comprobante,
          tipoTexto: TIPOS_COMPROBANTE[c.tipo_comprobante] || c.tipo_comprobante,
          numero: c.numero_comprobante || "",
          notas: c.notas || "",
          condicionFiscal: c.condicion_fiscal,
          total,
          neto: Number(c.neto),
          iva: Number(c.iva),
          creditoFiscal: Number(c.credito_fiscal),
          estado: c.estado,
          motivoAnulacion: c.motivo_anulacion || "",
          items: (c.compra_items || [])
            .map((i) => ({
              id: i.id,
              productoId: i.producto_id,
              sku: i.sku,
              nombre: i.nombre,
              cantidad: i.cantidad,
              costoUnitarioConIva: Number(i.costo_unitario_con_iva),
              alicuotaIva: Number(i.alicuota_iva),
              total: Number(i.total),
              neto: Number(i.neto),
              iva: Number(i.iva),
              creditoFiscal: Number(i.credito_fiscal),
            }))
            .sort((a, b) => a.id - b.id),
          pagos,
          pagado,
          saldo: c.estado === "activa" ? Math.max(redondear(total - pagado), 0) : 0,
          estadoPago: estadoPagoCompra({ total, pagado, estado: c.estado }),
        };
      }),
    [datos],
  );

  const deudaPorProveedor = useMemo(() => {
    const mapa = new Map();
    for (const c of compras) {
      if (c.estado === "activa" && c.proveedorId && c.saldo > 0) {
        mapa.set(c.proveedorId, redondear((mapa.get(c.proveedorId) || 0) + c.saldo));
      }
    }
    return mapa;
  }, [compras]);

  // Cada operación cambia compras y también el stock y el costo de los productos
  const operar = async (llamada) => {
    const exito = await guardar(llamada);
    invalidar(CLAVE_COMPRAS, CLAVE_PRODUCTOS);
    return exito;
  };

  const registrar = (datosCompra) => operar(() => api("POST", "/compras", datosCompra));
  const pagar = (id, pago) => operar(() => api("POST", "/compras/" + id + "/pagos", pago));
  const anularPago = (idPago, motivo) => operar(() => api("POST", "/compras/pagos/" + idPago + "/anular", { motivo }));
  const anular = (id, motivo) => operar(() => api("POST", "/compras/" + id + "/anular", { motivo }));

  return { compras, cargando, disponible: tablasDisponibles, deudaPorProveedor, registrar, pagar, anularPago, anular };
}

