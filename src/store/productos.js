import { db, ok } from "./db.js";
import { useConsulta } from "./consultas.js";

export const CLAVE_PRODUCTOS = "productos";
const CAMPOS_BASE =
  "id,sku,nombre,categoria,marca,modelo,color,serial,precio,stock,stock_minimo,proveedor_id,proveedores(nombre)";
const CAMPOS = CAMPOS_BASE + ",alicuota_iva,costo,costo_con_iva";

// Si todavía no se ejecutó 08_productos_costo.sql, las columnas de costo no existen: la app sigue funcionando como antes
let conCostos = true;
export const costosDisponibles = () => conCostos;

async function pedir() {
  const nuevo = await db().from("productos").select(CAMPOS).order("id");
  if (!nuevo.error) {
    conCostos = true;
    return nuevo.data;
  }
  if (nuevo.error.code !== "42703") throw nuevo.error; // 42703 = columna inexistente
  conCostos = false;
  return ok(await db().from("productos").select(CAMPOS_BASE).order("id"));
}

/** Filas crudas de la tabla productos (catálogo + inventario). Lo usan useInventario, useCatalogo y useFinanzas. */
export function useProductosDB() {
  return useConsulta(CLAVE_PRODUCTOS, pedir);
}

/** Registra un cambio de stock en el historial (movimientos_stock). cantidad: positiva suma, negativa resta. */
export async function registrarMovimiento(productoId, tipo, cantidad, motivo) {
  ok(await db().from("movimientos_stock").insert({ producto_id: productoId, tipo, cantidad, motivo: motivo || null }));
}
