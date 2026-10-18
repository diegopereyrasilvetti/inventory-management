import { useMemo } from "react";
import { api } from "../lib/api.js";
import { db, guardar, nulo, ok } from "./db.js";
import { invalidar, useConsulta } from "./consultas.js";
import { avisarError } from "./avisos.js";
import { CLAVE_PRODUCTOS, useProductosDB } from "./productos.js";
import { costoDeVentas } from "../lib/impuestos.js";

const CLAVE_VENTAS = "ventas";
const CLAVE_GASTOS = "gastos";

export const MONEDA = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const CATEGORIAS_GASTO = [
  "Mercadería y proveedores",
  "Alquiler",
  "Servicios (luz, agua, internet)",
  "Sueldos y personal",
  "Transporte y envíos",
  "Impuestos y tasas",
  "Mantenimiento",
  "Packaging e insumos",
  "Publicidad",
  "Otros",
];

/** Fecha local en formato AAAA-MM-DD. */
export function iso(fecha = new Date()) {
  return fecha.toLocaleDateString("en-CA");
}

function hora(creada) {
  return new Date(creada).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const VENTA_BASE = "id,fecha,metodo,total,created_at";
const ITEM_BASE = "id,producto_id,sku,nombre,precio,cantidad";

async function pedirVentas() {
  // Con el desglose de IVA y el costo histórico (09_ventas_desglose.sql). Si todavía no se ejecutó, se pide como antes.
  const nuevo = await db()
    .from("ventas")
    .select(VENTA_BASE + ",condicion_fiscal,neto,iva,venta_items(" + ITEM_BASE + ",alicuota_iva,neto,iva,costo_unitario)")
    .order("created_at");
  if (!nuevo.error) return nuevo.data;
  if (nuevo.error.code !== "42703") throw nuevo.error; // 42703 = columna inexistente
  return ok(await db().from("ventas").select(VENTA_BASE + ",venta_items(" + ITEM_BASE + ")").order("created_at"));
}

const aNumero = (x) => (x === null || x === undefined ? null : Number(x));

async function pedirGastos() {
  return ok(await db().from("gastos").select("id,fecha,categoria,detalle,monto").order("id"));
}

/**
 * Ventas y gastos.
 * ventas: [{ id, fecha: 'AAAA-MM-DD', hora: 'HH:mm', items: [{ sku, nombre, precio, cantidad, ... }], metodo, total, ... }]
 *   Desglose (null en las ventas anteriores a la fase de impuestos): condicionFiscal, neto, iva; cada ítem: alicuotaIva, neto, iva, costoUnitario
 *   (el costo del producto al momento de vender; null = se desconocía, nunca se toma como 0).
 *   costo: { total, completo, unidadesSinCosto } del costo de lo vendido, o null si la venta no tiene desglose.
 * gastos: [{ id, fecha, categoria, detalle, monto }]
 * Los guardados devuelven true/false. Una venta descuenta el stock de cada producto y lo anota en movimientos_stock;
 * al eliminarla, el stock se devuelve.
 */
export function useFinanzas() {
  const { datos: filasVentas, cargando: cargandoVentas } = useConsulta(CLAVE_VENTAS, pedirVentas);
  const { datos: filasGastos, cargando: cargandoGastos } = useConsulta(CLAVE_GASTOS, pedirGastos);
  const { datos: filasProductos } = useProductosDB();

  const ventas = useMemo(
    () =>
      filasVentas.map((v) => {
        const items = (v.venta_items || []).map((it) => ({
          sku: it.sku,
          nombre: it.nombre,
          precio: Number(it.precio),
          cantidad: it.cantidad,
          productoId: it.producto_id,
          alicuotaIva: aNumero(it.alicuota_iva),
          neto: aNumero(it.neto),
          iva: aNumero(it.iva),
          costoUnitario: aNumero(it.costo_unitario),
        }));
        const conDesglose = aNumero(v.neto) !== null;
        return {
          id: v.id,
          fecha: v.fecha,
          hora: hora(v.created_at),
          metodo: v.metodo,
          total: Number(v.total),
          condicionFiscal: v.condicion_fiscal ?? null,
          neto: aNumero(v.neto),
          iva: aNumero(v.iva),
          items,
          costo: conDesglose ? costoDeVentas(items) : null,
        };
      }),
    [filasVentas],
  );

  const gastos = useMemo(
    () =>
      filasGastos.map((g) => ({
        id: g.id,
        fecha: g.fecha,
        categoria: g.categoria,
        detalle: g.detalle || "",
        monto: Number(g.monto),
      })),
    [filasGastos],
  );

  // venta sin id: { fecha, hora, items, metodo, total }
  // La API arma la venta completa en un solo paso: guarda los ítems, baja el stock y anota los movimientos.
  // El total y los precios los calcula el servidor con los datos de la base.
  async function agregarVenta(venta) {
    const porSku = new Map(filasProductos.map((p) => [p.sku, p]));
    const items = [];
    for (const it of venta.items) {
      const p = porSku.get(it.sku);
      if (!p) {
        avisarError('El producto "' + it.nombre + '" ya no existe en tu inventario.');
        return false;
      }
      items.push({ producto_id: p.id, cantidad: it.cantidad });
    }
    const exito = await guardar(() => api("POST", "/ventas", { fecha: venta.fecha, metodo: venta.metodo, items }));
    invalidar(CLAVE_VENTAS, CLAVE_PRODUCTOS);
    return exito;
  }

  // La API elimina la venta y devuelve el stock de los productos
  async function eliminarVenta(id) {
    const exito = await guardar(() => api("DELETE", "/ventas/" + id));
    invalidar(CLAVE_VENTAS, CLAVE_PRODUCTOS);
    return exito;
  }

  // gasto sin id: { fecha, categoria, detalle, monto }
  const agregarGasto = (g) =>
    guardar(async () => {
      ok(
        await db()
          .from("gastos")
          .insert({ fecha: g.fecha, categoria: g.categoria, detalle: nulo(g.detalle), monto: g.monto }),
      );
      invalidar(CLAVE_GASTOS);
    });

  const eliminarGasto = (id) =>
    guardar(async () => {
      ok(await db().from("gastos").delete().eq("id", id));
      invalidar(CLAVE_GASTOS);
    });

  return {
    ventas,
    gastos,
    cargando: cargandoVentas || cargandoGastos,
    agregarVenta,
    agregarGasto,
    eliminarVenta,
    eliminarGasto,
  };
}
