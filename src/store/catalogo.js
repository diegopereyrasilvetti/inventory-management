import { useMemo } from "react";
import { db, guardar, nulo, ok } from "./db.js";
import { invalidar } from "./consultas.js";
import { avisarError } from "./avisos.js";
import { CLAVE_PRODUCTOS, costosDisponibles, registrarMovimiento, useProductosDB } from "./productos.js";
import { useConfiguracionFiscal } from "./configuracionFiscal.js";
import { costosDeProducto } from "../lib/impuestos.js";
import { useProveedores } from "./proveedores.js";

/**
 * Catálogo (datos descriptivos y precio de cada producto), sobre la misma tabla productos que el inventario.
 * { catalogo, cargando, agregar(datos), actualizar(id, datos), eliminar(id) }
 * El proveedor se escribe por nombre y se vincula con la tabla proveedores.
 * Costos: costoConIva = lo que se pagó por unidad (IVA incluido); costo = costo comparable (base del promedio
 * ponderado); null = costo desconocido (nunca se trata como cero). alicuotaIva null = usa la general.
 * cargarCostos([{ id, costoConIva }]) carga costos de varios productos a la vez (costo inicial del stock existente).
 */
export function useCatalogo() {
  const { datos, cargando } = useProductosDB();
  const { proveedores } = useProveedores();
  const { config, existe: hayConfig, cargando: cargandoConfig } = useConfiguracionFiscal();

  const catalogo = useMemo(
    () =>
      datos.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        sku: r.sku,
        categoria: r.categoria || "",
        marca: r.marca || "",
        modelo: r.modelo || "",
        color: r.color || "",
        serial: r.serial || "",
        proveedor: r.proveedores?.nombre || "",
        precio: r.precio === null || r.precio === undefined ? null : Number(r.precio),
        stock: r.stock,
        alicuotaIva: r.alicuota_iva == null ? null : Number(r.alicuota_iva),
        costoConIva: r.costo_con_iva == null ? null : Number(r.costo_con_iva),
        costo: r.costo == null ? null : Number(r.costo),
      })),
    [datos],
  );

  // Devuelve { id } del proveedor (id es null si no se escribió ninguno) o null si ese nombre no existe
  function resolverProveedor(nombre) {
    const buscado = (nombre || "").trim().toLowerCase();
    if (!buscado) return { id: null };
    const p = proveedores.find((x) => x.nombre.trim().toLowerCase() === buscado);
    return p ? { id: p.id } : null;
  }

  // Los costos se guardan solo si el producto trae el dato (d.costoConIva !== undefined) y la base ya tiene las columnas
  function filaCostos(d) {
    if (d.costoConIva === undefined || !costosDisponibles()) return {};
    const alicuota = d.alicuotaIva === "" || d.alicuotaIva === undefined ? null : d.alicuotaIva;
    const { costoConIva, costo } = costosDeProducto({ costoConIva: d.costoConIva, alicuota }, config);
    return { alicuota_iva: alicuota, costo_con_iva: costoConIva, costo };
  }

  // El costo comparable depende de la condición fiscal: sin la configuración cargada no se calcula (evita guardar un valor equivocado)
  function configFiscalLista(hayCosto) {
    if (!hayCosto || (!cargandoConfig && hayConfig)) return true;
    avisarError("No se pudo leer la configuración fiscal, así que no se puede calcular el costo. Probá de nuevo en unos segundos.");
    return false;
  }

  function aFila(d, proveedorId) {
    return {
      ...filaCostos(d),
      sku: d.sku,
      nombre: d.nombre,
      categoria: nulo(d.categoria),
      marca: nulo(d.marca),
      modelo: nulo(d.modelo),
      color: nulo(d.color),
      serial: nulo(d.serial),
      precio: d.precio ?? null,
      proveedor_id: proveedorId,
    };
  }

  async function guardarProducto(d, operacion) {
    if (!configFiscalLista(d.costoConIva !== undefined && d.costoConIva !== null)) return false;
    const proveedor = resolverProveedor(d.proveedor);
    if (!proveedor) {
      avisarError('El proveedor "' + d.proveedor.trim() + '" no existe. Cargalo primero en la sección Proveedores.');
      return false;
    }
    return guardar(async () => {
      await operacion(aFila(d, proveedor.id));
      invalidar(CLAVE_PRODUCTOS);
    });
  }

  // Al crear un producto se puede cargar su stock inicial y el mínimo (con el que se disparan las alertas)
  const agregar = (d) =>
    guardarProducto(d, async (fila) => {
      const stock = Number.isInteger(d.stock) ? d.stock : 0;
      const stockMinimo = Number.isInteger(d.minimo) ? d.minimo : 0;
      const creado = ok(
        await db().from("productos").insert({ ...fila, stock, stock_minimo: stockMinimo }).select("id").single(),
      );
      if (stock > 0) await registrarMovimiento(creado.id, "entrada", stock, "Stock inicial");
    });
  // Editar otros datos (color, precio...) no toca el costo: solo se recalcula si cambió el costo o el IVA
  const actualizar = (id, d) => {
    const actual = catalogo.find((p) => p.id === id);
    const sinCambioDeCosto = actual && d.costoConIva === actual.costoConIva && (d.alicuotaIva ?? null) === actual.alicuotaIva;
    const datos = sinCambioDeCosto ? { ...d, costoConIva: undefined } : d;
    return guardarProducto(datos, async (fila) => ok(await db().from("productos").update(fila).eq("id", id)));
  };
  const cargarCostos = (lista) => {
    if (!configFiscalLista(true)) return Promise.resolve(false);
    return guardar(async () => {
      try {
        for (const { id, costoConIva } of lista) {
          const actual = catalogo.find((p) => p.id === id);
          const { costoConIva: conIva, costo } = costosDeProducto({ costoConIva, alicuota: actual?.alicuotaIva ?? null }, config);
          ok(await db().from("productos").update({ costo_con_iva: conIva, costo }).eq("id", id));
        }
      } finally {
        invalidar(CLAVE_PRODUCTOS); // aunque falle uno, se refleja lo que sí se guardó
      }
    });
  };
  const eliminar = (id) =>
    guardar(async () => {
      ok(await db().from("productos").delete().eq("id", id));
      invalidar(CLAVE_PRODUCTOS);
    });

  return { catalogo, cargando, agregar, actualizar, eliminar, cargarCostos, costosDisponibles: costosDisponibles() };
}
