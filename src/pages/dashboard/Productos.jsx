import { useRef, useState } from "react";
import CargaCostos from "../../components/CargaCostos.jsx";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { discriminaIva, costosDeProducto } from "../../lib/impuestos.js";
import { useCatalogo } from "../../store/catalogo.js";
import { useConfiguracionFiscal } from "../../store/configuracionFiscal.js";
import { useProveedores } from "../../store/proveedores.js";

const CAMPOS_BUSQUEDA = ["nombre", "sku", "categoria", "marca", "modelo", "color", "serial", "proveedor"];
const DETALLES = [
  { clave: "categoria", etiqueta: "Categoría", fila: "row-start-3" },
  { clave: "marca", etiqueta: "Marca", fila: "row-start-4" },
  { clave: "modelo", etiqueta: "Modelo", fila: "row-start-5" },
  { clave: "color", etiqueta: "Color", fila: "row-start-6" },
  { clave: "serial", etiqueta: "Serial", fila: "row-start-7" },
  { clave: "proveedor", etiqueta: "Proveedor", fila: "row-start-8" },
  { clave: "precio", etiqueta: "Precio", fila: "row-start-9" },
  { clave: "costo", etiqueta: "Costo", fila: "row-start-10" },
  { clave: "alicuotaIva", etiqueta: "IVA", fila: "row-start-11" },
];
const MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const FORM_VACIO = {
  nombre: "", sku: "", categoria: "", marca: "", modelo: "", color: "", serial: "", proveedor: "", precio: "",
  alicuotaIva: "", costoConIva: "", stock: "0", minimo: "10",
};
const BASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";
const CLASE_INPUT = BASE_INPUT + " text-sm";
const CLASE_INPUT_SKU = BASE_INPUT + " font-mono text-sm uppercase";
const CLASE_INPUT_SERIAL = BASE_INPUT + " font-mono text-sm";

const aTexto = (n) => String(n).replace(".", ",");
const etiquetaAlicuota = (a) => (a === 0 ? "Exento (0 %)" : aTexto(a) + " %");

function valoresUnicos(lista, campo) {
  const valores = [];
  lista.forEach((p) => {
    if (p[campo] && !valores.includes(p[campo])) valores.push(p[campo]);
  });
  return valores.sort();
}

export default function Productos() {
  const { catalogo, cargando, agregar, actualizar, eliminar, cargarCostos, costosDisponibles } = useCatalogo();
  const { config } = useConfiguracionFiscal();
  const conIva = discriminaIva(config); // solo el Responsable Inscripto discrimina IVA
  const { proveedores } = useProveedores();
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [idEditado, setIdEditado] = useState(null);
  const [error, setError] = useState("");
  const dialogoRef = useRef(null);
  const nombreRef = useRef(null);
  const dialogoCostosRef = useRef(null);

  const [soloSinCosto, setSoloSinCosto] = useState(false);
  const detalles = DETALLES.filter((d) => d.clave !== "alicuotaIva" || conIva);
  const sinCosto = costosDisponibles ? catalogo.filter((p) => p.costoConIva === null) : [];
  const sinCostoConStock = sinCosto.filter((p) => p.stock > 0).length;

  const q = busqueda.trim().toLowerCase();
  const visibles = catalogo
    .filter((p) => !soloSinCosto || p.costoConIva === null)
    .filter((p) => !q || CAMPOS_BUSQUEDA.some((c) => String(p[c] || "").toLowerCase().includes(q)));

  // Vista previa del costo mientras se escribe en el formulario
  const previaCosto = costosDeProducto(
    { costoConIva: form.costoConIva, alicuota: form.alicuotaIva === "" ? null : Number(form.alicuotaIva) },
    config,
  );

  function campo(nombre) {
    return (e) => setForm((f) => ({ ...f, [nombre]: e.target.value }));
  }

  function abrir(producto) {
    setError("");
    setIdEditado(producto ? producto.id : null);
    setForm(
      producto
        ? {
            nombre: producto.nombre,
            sku: producto.sku,
            categoria: producto.categoria || "",
            marca: producto.marca || "",
            modelo: producto.modelo || "",
            color: producto.color || "",
            serial: producto.serial || "",
            proveedor: producto.proveedor || "",
            precio: typeof producto.precio === "number" ? producto.precio : "",
            alicuotaIva: producto.alicuotaIva === null ? "" : String(producto.alicuotaIva),
            costoConIva: producto.costoConIva === null ? "" : producto.costoConIva,
            stock: "0",
            minimo: "10",
          }
        : FORM_VACIO,
    );
    dialogoRef.current.showModal();
    nombreRef.current?.focus();
  }

  function borrar(p) {
    if (window.confirm('¿Eliminar "' + p.nombre + '" del catálogo?')) eliminar(p.id);
  }

  async function guardar(e) {
    e.preventDefault();
    const datos = {
      nombre: form.nombre.trim(),
      sku: form.sku.trim().toUpperCase(),
      categoria: form.categoria.trim(),
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      color: form.color.trim(),
      serial: form.serial.trim(),
      proveedor: form.proveedor.trim(),
      precio: parseFloat(form.precio),
    };
    if (!(datos.precio >= 0)) datos.precio = null;
    // Costo vacío = desconocido (nunca cero). Si la base todavía no tiene las columnas de costo, no se envía nada
    if (costosDisponibles) {
      datos.alicuotaIva = form.alicuotaIva === "" ? null : Number(form.alicuotaIva);
      datos.costoConIva = String(form.costoConIva).trim() === "" ? null : parseFloat(String(form.costoConIva).replace(",", "."));
    }
    // Stock y mínimo solo se cargan al crear; después el stock se cambia desde Inventario
    if (!idEditado) {
      datos.stock = parseInt(form.stock, 10);
      datos.minimo = parseInt(form.minimo, 10);
    }

    let mensaje = "";
    if (!datos.nombre || !datos.sku) {
      mensaje = "Completá el nombre y el SKU del producto.";
    } else if (costosDisponibles && datos.costoConIva !== null && !(datos.costoConIva >= 0)) {
      mensaje = "El costo tiene que ser un importe de 0 en adelante (o dejalo vacío si no lo sabés).";
    } else if (!idEditado && (!(datos.stock >= 0) || !(datos.minimo >= 0))) {
      mensaje = "El stock y el mínimo deben ser números de 0 en adelante.";
    } else if (catalogo.some((p) => p.sku === datos.sku && p.id !== idEditado)) {
      mensaje = "Ya existe un producto con el SKU " + datos.sku + ".";
    }
    if (mensaje) {
      setError(mensaje);
      return;
    }

    const exito = idEditado ? await actualizar(idEditado, datos) : await agregar(datos);
    if (exito) dialogoRef.current.close();
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-productos">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="titulo-productos" className="text-xl font-bold text-(--texto)">Productos</h2>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Creá, editá y eliminá los datos de cada producto.</p>
        </div>
        <span className="rounded-full bg-(--viz-verde-fondo) px-3 py-1 text-xs font-semibold text-(--viz-verde-texto)">
          {catalogo.length + (catalogo.length === 1 ? " producto" : " productos")}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-6">
        <form className="relative w-full sm:w-72" role="search" onSubmit={(e) => e.preventDefault()}>
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
          <input
            className="w-full rounded-lg border border-(--borde) bg-(--fondo) py-2.5 pl-8 pr-3 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
            type="search"
            placeholder="Buscar por nombre, SKU, marca…"
            aria-label="Buscar producto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </form>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-(--acento-hover) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--texto) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
          type="button"
          onClick={() => abrir(null)}
        >
          <i className="fa-solid fa-plus text-xs" /> Nuevo producto
        </button>
      </div>

      {sinCosto.length > 0 && (
        <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--stock-bajo)/50 bg-(--fondo) px-4 py-3 sm:mx-6" role="status" data-aviso-costos>
          <p className="min-w-0 flex-1 text-sm text-(--texto)">
            <i className="fa-solid fa-triangle-exclamation mr-1.5 text-(--stock-bajo)" />
            <strong>{sinCosto.length}</strong> {sinCosto.length === 1 ? "producto no tiene" : "productos no tienen"} costo cargado
            {sinCostoConStock > 0 && <> ({sinCostoConStock} con stock)</>}. Mientras tanto, las ganancias que los usen se mostrarán como incompletas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-full border border-(--borde) px-4 py-2 text-sm font-medium cursor-pointer hover:bg-(--superficie)" onClick={() => setSoloSinCosto((v) => !v)} aria-pressed={soloSinCosto}>
              {soloSinCosto ? "Ver todos" : "Ver solo sin costo"}
            </button>
            <button type="button" className="rounded-full bg-(--acento-hover) px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto)" onClick={() => dialogoCostosRef.current.showModal()}>
              Cargar costos
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 px-4 pb-3 sm:mt-3 sm:px-6 xl:overflow-x-auto">
        <table className="block w-full border-collapse text-left xl:table xl:min-w-[66rem]">
          <thead className="hidden xl:table-header-group">
            <tr className="border-b border-(--borde) text-xs font-semibold uppercase tracking-wider text-(--texto-suave)">
              <th className="py-3 pr-4" scope="col">Producto</th>
              <th className="py-3 pr-4" scope="col">SKU</th>
              <th className="py-3 pr-4" scope="col">Categoría</th>
              <th className="py-3 pr-4" scope="col">Marca</th>
              <th className="py-3 pr-4" scope="col">Modelo</th>
              <th className="py-3 pr-4" scope="col">Color</th>
              <th className="py-3 pr-4" scope="col">Serial</th>
              <th className="py-3 pr-4" scope="col">Proveedor</th>
              <th className="py-3 pr-4" scope="col">Precio</th>
              <th className="py-3 pr-4" scope="col">Costo</th>
              {conIva && <th className="py-3 pr-4" scope="col">IVA</th>}
              <th className="py-3 w-20" scope="col"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="block md:grid md:grid-cols-2 md:gap-x-8 xl:table-row-group">
            {visibles.map((p) => (
              <tr
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-(--borde) py-4 last:border-0 hover:bg-(--fondo)/60 xl:table-row xl:py-0"
              >
                <td className="col-start-1 row-start-1 min-w-0 font-semibold text-(--texto) [overflow-wrap:anywhere] xl:py-3.5 xl:pr-4 xl:font-medium">{p.nombre}</td>
                <td className="col-span-2 row-start-2 min-w-0 font-mono text-sm text-(--texto-suave) [overflow-wrap:anywhere] xl:py-3.5 xl:pr-4 xl:whitespace-nowrap">{p.sku}</td>
                {detalles.map((d) => {
                  let valor = p[d.clave];
                  if (d.clave === "precio") valor = typeof valor === "number" ? MONEDA.format(valor) : "";
                  if (d.clave === "costo") {
                    valor =
                      p.costoConIva === null ? (
                        <span className="rounded-full bg-(--viz-naranja-fondo) px-2.5 py-0.5 text-xs font-semibold text-(--viz-naranja-texto)">Sin costo</span>
                      ) : (
                        MONEDA.format(p.costoConIva)
                      );
                  }
                  if (d.clave === "alicuotaIva") {
                    valor = etiquetaAlicuota(p.alicuotaIva ?? config.alicuotaIvaGeneral);
                  }
                  return (
                    <td
                      key={d.clave}
                      className={
                        "col-span-2 " + d.fila + " flex items-baseline justify-between gap-3 text-sm text-(--texto) xl:table-cell xl:py-3.5 xl:pr-4" +
                        (["serial", "precio", "costo", "alicuotaIva"].includes(d.clave) ? " xl:whitespace-nowrap" : "")
                      }
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider text-(--texto-suave) xl:hidden">{d.etiqueta}</span>
                      <span className={"min-w-0 [overflow-wrap:anywhere] " + (d.clave === "serial" ? "font-mono" : (d.clave === "precio" || d.clave === "costo") ? "font-semibold" : "")}>
                        {valor || "—"}
                      </span>
                    </td>
                  );
                })}
                <td className="col-start-2 row-start-1 flex justify-self-end gap-1 xl:table-cell xl:py-3.5 xl:text-right xl:whitespace-nowrap">
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition xl:size-8 hover:bg-(--fondo) hover:text-(--acento-hover) xl:inline-flex"
                    aria-label={"Editar " + p.nombre}
                    onClick={() => abrir(p)}
                  >
                    <i className="fa-regular fa-pen-to-square text-sm" />
                  </button>
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition xl:size-8 hover:bg-(--stock-agotado)/10 hover:text-(--stock-agotado) xl:inline-flex"
                    aria-label={"Eliminar " + p.nombre}
                    onClick={() => borrar(p)}
                  >
                    <i className="fa-regular fa-trash-can text-sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && (
          <p className="py-10 text-center text-sm text-(--texto-suave)">
            {catalogo.length === 0
              ? 'Todavía no cargaste productos. Tocá "Nuevo producto" para empezar.'
              : "No hay productos que coincidan con la búsqueda."}
          </p>
        )}
      </div>

      <dialog
        ref={dialogoRef}
        className="m-auto w-[min(94vw,32rem)] max-h-[92vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      >
        <form className="flex flex-col gap-4 p-6" noValidate onSubmit={guardar}>
          <h3 className="text-lg font-bold">{idEditado ? "Editar producto" : "Nuevo producto"}</h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="prod-nombre">Nombre *</label>
            <input ref={nombreRef} className={CLASE_INPUT} id="prod-nombre" type="text" maxLength={80} placeholder="Ej: Camiseta básica" required value={form.nombre} onChange={campo("nombre")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-sku">SKU *</label>
              <input className={CLASE_INPUT_SKU} id="prod-sku" type="text" maxLength={30} placeholder="CAM-001" required value={form.sku} onChange={campo("sku")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-serial">Serial</label>
              <input className={CLASE_INPUT_SERIAL} id="prod-serial" type="text" maxLength={40} placeholder="Número de serie" value={form.serial} onChange={campo("serial")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-categoria">Categoría</label>
              <input className={CLASE_INPUT} id="prod-categoria" type="text" maxLength={40} list="prod-lista-categorias" placeholder="Ej: Indumentaria" value={form.categoria} onChange={campo("categoria")} />
              <datalist id="prod-lista-categorias">
                {valoresUnicos(catalogo, "categoria").map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-marca">Marca</label>
              <input className={CLASE_INPUT} id="prod-marca" type="text" maxLength={40} placeholder="Ej: Nombre de la marca" value={form.marca} onChange={campo("marca")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-modelo">Modelo</label>
              <input className={CLASE_INPUT} id="prod-modelo" type="text" maxLength={40} placeholder="Ej: Clásica" value={form.modelo} onChange={campo("modelo")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-color">Color</label>
              <input className={CLASE_INPUT} id="prod-color" type="text" maxLength={30} placeholder="Ej: Negro" value={form.color} onChange={campo("color")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-proveedor">Proveedor</label>
              <input className={CLASE_INPUT} id="prod-proveedor" type="text" maxLength={60} list="prod-lista-proveedores" placeholder="Ej: Distribuidora Central" value={form.proveedor} onChange={campo("proveedor")} />
              <datalist id="prod-lista-proveedores">
                {proveedores.map((p) => <option key={p.id} value={p.nombre} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prod-precio">Precio ($)</label>
              <input className={CLASE_INPUT} id="prod-precio" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={form.precio} onChange={campo("precio")} />
            </div>
            {costosDisponibles && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="prod-costo">Costo de compra por unidad ($)</label>
                  <input className={CLASE_INPUT} id="prod-costo" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Vacío = no lo sé" value={form.costoConIva} onChange={campo("costoConIva")} />
                </div>
                {conIva && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor="prod-iva">Alícuota de IVA</label>
                    <select className={CLASE_INPUT} id="prod-iva" value={form.alicuotaIva} onChange={campo("alicuotaIva")}>
                      <option value="">General ({aTexto(config.alicuotaIvaGeneral)} %)</option>
                      {config.alicuotasIva.map((a) => (
                        <option key={a} value={a}>{etiquetaAlicuota(a)}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-(--texto-suave) sm:col-span-2" data-ayuda-costo>
                  {previaCosto.costo === null
                    ? "Escribí lo que pagaste por unidad, con el IVA incluido. Si no lo sabés, dejalo vacío: el producto quedará con costo pendiente (no se toma como cero)."
                    : conIva && previaCosto.costo !== previaCosto.costoConIva
                      ? "Costo sin IVA: " + MONEDA.format(previaCosto.costo) + ". El IVA de la compra se descuenta como crédito fiscal."
                      : "Con tu condición fiscal, el IVA de la compra forma parte del costo: se registra " + MONEDA.format(previaCosto.costo) + "."}
                </p>
              </>
            )}
            {!idEditado && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="prod-stock">Stock inicial</label>
                  <input className={CLASE_INPUT} id="prod-stock" type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={campo("stock")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="prod-minimo">Stock mínimo</label>
                  <input className={CLASE_INPUT} id="prod-minimo" type="number" min="0" step="1" inputMode="numeric" value={form.minimo} onChange={campo("minimo")} />
                </div>
              </>
            )}
          </div>

          {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoRef.current.close()}>Cancelar</button>
            <button className="rounded-full bg-(--acento-hover) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto)" type="submit">Guardar</button>
          </div>
        </form>
      </dialog>
      <CargaCostos dialogoRef={dialogoCostosRef} productos={catalogo} config={config} alGuardar={cargarCostos} />
    </SeccionDashboard>
  );
}
