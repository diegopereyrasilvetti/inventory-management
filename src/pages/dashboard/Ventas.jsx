import { useMemo, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { discriminaIva, ivaDeVenta, redondear } from "../../lib/impuestos.js";
import { useCatalogo } from "../../store/catalogo.js";
import { useConfiguracionFiscal } from "../../store/configuracionFiscal.js";
import { useFinanzas, MONEDA, CATEGORIAS_GASTO, iso } from "../../store/finanzas.js";
import useAviso from "../../hooks/useAviso.js";

const CLASES_QUITAR =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition hover:bg-(--stock-agotado)/10 hover:text-(--stock-agotado)";

function horaActual() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function BotonQuitar({ etiqueta, onClick }) {
  return (
    <button type="button" className={CLASES_QUITAR} aria-label={etiqueta} onClick={onClick}>
      <i className="fa-regular fa-trash-can text-sm" />
    </button>
  );
}

function claseMensaje(aviso) {
  if (!aviso) return "hidden text-sm";
  return "text-sm " + (aviso.ok ? "text-(--viz-verde-texto)" : "text-(--stock-agotado)");
}

export default function Ventas() {
  const { ventas, gastos, agregarVenta, agregarGasto, eliminarVenta, eliminarGasto } = useFinanzas();
  const { catalogo, costosDisponibles } = useCatalogo();
  const { config } = useConfiguracionFiscal();

  const [fecha, setFecha] = useState(() => iso());
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [carrito, setCarrito] = useState([]);
  const [metodo, setMetodo] = useState("Efectivo");
  const [avisoVenta, avisarVenta] = useAviso();

  const [categoria, setCategoria] = useState(CATEGORIAS_GASTO[0]);
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [avisoGasto, avisarGasto] = useAviso();

  const productos = useMemo(
    () => catalogo.filter((p) => typeof p.precio === "number" && p.precio > 0),
    [catalogo],
  );
  const sinProductos = productos.length === 0;
  const skuActual = productos.some((p) => p.sku === sku) ? sku : (productos[0]?.sku ?? "");

  const totalCarrito = carrito.reduce((suma, it) => suma + it.precio * it.cantidad, 0);
  // Desglose de referencia (el definitivo lo calcula la base al registrar, con las mismas reglas, renglón por renglón)
  const desgloseCarrito = carrito.reduce(
    (suma, it) => {
      const d = ivaDeVenta({ total: it.precio * it.cantidad, alicuota: it.alicuotaIva }, config);
      return { neto: suma.neto + d.neto, iva: suma.iva + d.iva };
    },
    { neto: 0, iva: 0 },
  );
  const sinCostoCarrito = costosDisponibles ? carrito.filter((it) => it.sinCosto) : [];

  const dia = fecha || iso();
  const deDia = ventas.filter((v) => v.fecha === dia);
  const gastosDia = gastos.filter((g) => g.fecha === dia);
  const ingresos = deDia.reduce((s, v) => s + v.total, 0);
  const totalGastos = gastosDia.reduce((s, g) => s + g.monto, 0);
  const balance = ingresos - totalGastos;
  const colorBalance =
    balance > 0 ? "text-(--viz-verde-texto)" : balance < 0 ? "text-(--viz-naranja-texto)" : "text-(--texto)";

  function agregarAlCarrito() {
    const producto = productos.find((p) => p.sku === skuActual);
    const cant = parseInt(cantidad, 10);
    if (!producto) return;
    if (!(cant >= 1)) {
      avisarVenta("La cantidad debe ser 1 o más.", false);
      return;
    }
    setCarrito((actual) => {
      if (actual.some((it) => it.sku === skuActual)) {
        return actual.map((it) => (it.sku === skuActual ? { ...it, cantidad: it.cantidad + cant } : it));
      }
      return [
        ...actual,
        { sku: producto.sku, nombre: producto.nombre, precio: producto.precio, cantidad: cant, alicuotaIva: producto.alicuotaIva, sinCosto: producto.costoConIva === null },
      ];
    });
    setCantidad("1");
  }

  async function registrarVenta(e) {
    e.preventDefault();
    if (carrito.length === 0) return;
    const venta = {
      fecha: fecha || iso(),
      hora: horaActual(),
      items: carrito.map((it) => ({ ...it })),
      metodo,
      total: totalCarrito,
    };
    if (!(await agregarVenta(venta))) return; // si falló, el cartel de error ya avisó y el carrito se conserva
    setCarrito([]);
    avisarVenta("Venta registrada: " + MONEDA.format(venta.total) + " (" + metodo + ").", true);
  }

  async function registrarGasto(e) {
    e.preventDefault();
    const valor = parseFloat(monto);
    if (!(valor > 0)) {
      avisarGasto("Ingresá un monto mayor a 0.", false);
      return;
    }
    if (!(await agregarGasto({ fecha: fecha || iso(), categoria, detalle: detalle.trim(), monto: valor }))) return;
    setCategoria(CATEGORIAS_GASTO[0]);
    setDetalle("");
    setMonto("");
    avisarGasto("Gasto registrado: " + MONEDA.format(valor) + ".", true);
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-ventas">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="titulo-ventas" className="text-xl font-bold text-(--texto)">Ventas</h2>
            <span className="rounded-full bg-(--viz-verde-fondo) px-2.5 py-0.5 text-xs font-semibold text-(--viz-verde-texto)">Demo interactiva</span>
          </div>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Registro y control de operaciones</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-(--texto)" htmlFor="vta-fecha">Día</label>
          <input
            id="vta-fecha"
            className="rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value || iso())}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-3 sm:gap-4 sm:px-6 lg:grid-cols-5">
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className="fa-solid fa-wallet text-(--viz-violeta)" aria-hidden="true" /> Ingresos del día</dt>
          <dd id="vta-ingresos" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(ingresos)}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className="fa-solid fa-bag-shopping text-(--viz-verde)" aria-hidden="true" /> Ventas</dt>
          <dd id="vta-cantidad" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{deDia.length}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className="fa-solid fa-receipt text-(--viz-violeta)" aria-hidden="true" /> Ticket promedio</dt>
          <dd id="vta-ticket" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(deDia.length ? ingresos / deDia.length : 0)}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className="fa-solid fa-money-bill-trend-up fa-flip-vertical text-(--viz-naranja)" aria-hidden="true" /> Gastos del día</dt>
          <dd id="vta-gastos" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(totalGastos)}</dd>
        </div>
        <div className="col-span-2 rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:col-span-1 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className="fa-solid fa-scale-balanced text-(--viz-verde)" aria-hidden="true" /> Balance del día</dt>
          <dd id="vta-balance" className={"mt-1.5 text-xl font-bold sm:text-2xl " + colorBalance}>{MONEDA.format(balance)}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-5 border-t border-(--borde) px-5 pt-5 sm:px-6 lg:grid-cols-2 lg:gap-8">
        {/* Registrar nueva venta */}
        <form id="vta-form" className="flex flex-col gap-4" noValidate onSubmit={registrarVenta}>
          <h3 className="text-lg font-bold text-(--texto)">Registrar nueva venta</h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-(--texto)" htmlFor="vta-producto">Seleccionar producto</label>
            <div className="relative">
              <select
                id="vta-producto"
                className="w-full cursor-pointer appearance-none rounded-full border border-(--borde) bg-(--fondo) py-3 pl-4 pr-10 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
                disabled={sinProductos}
                value={skuActual}
                onChange={(e) => setSku(e.target.value)}
              >
                {sinProductos ? (
                  <option value="">Cargá productos con precio en la sección Productos</option>
                ) : (
                  productos.map((p) => (
                    <option key={p.sku} value={p.sku}>{p.nombre + " — " + MONEDA.format(p.precio)}</option>
                  ))
                )}
              </select>
              <i className="fa-solid fa-chevron-down pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-(--texto)" htmlFor="vta-cantidad-input">Cantidad</label>
            <div className="flex gap-2">
              <input
                id="vta-cantidad-input"
                className="w-24 rounded-full border border-(--borde) bg-(--fondo) px-4 py-3 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30 sm:w-32"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
              <button
                id="vta-agregar"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-(--borde) px-4 py-3 text-sm font-medium text-(--texto) cursor-pointer transition hover:border-(--acento) hover:text-(--acento-hover)"
                type="button"
                disabled={sinProductos}
                onClick={agregarAlCarrito}
              >
                <i className="fa-solid fa-plus text-xs" /> Agregar
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-(--texto)">Productos de la venta</p>
            <ul
              id="vta-carrito"
              className={"mt-2 divide-y divide-(--borde) rounded-xl border border-(--borde)" + (carrito.length === 0 ? " hidden" : "")}
            >
              {carrito.map((it) => (
                <li key={it.sku} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-(--texto)">{it.cantidad + " × " + it.nombre}</p>
                    <p className="text-xs text-(--texto-suave)">{MONEDA.format(it.precio) + " c/u"}</p>
                  </div>
                  <span className="text-sm font-semibold text-(--texto)">{MONEDA.format(it.precio * it.cantidad)}</span>
                  <BotonQuitar
                    etiqueta={"Quitar " + it.nombre + " de la venta"}
                    onClick={() => setCarrito((actual) => actual.filter((x) => x.sku !== it.sku))}
                  />
                </li>
              ))}
            </ul>
            {carrito.length === 0 && (
              <p id="vta-carrito-vacio" className="mt-2 text-sm text-(--texto-suave)">Todavía no agregaste productos.</p>
            )}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold text-(--texto)">Método de pago</legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
              {["Efectivo", "Transferencia", "Tarjeta"].map((m) => (
                <label key={m} className="inline-flex cursor-pointer items-center gap-2 text-sm text-(--texto)">
                  <input
                    className="size-4 accent-(--acento-hover)"
                    type="radio"
                    name="vta-metodo"
                    value={m}
                    checked={metodo === m}
                    onChange={() => setMetodo(m)}
                  />{" "}
                  {m}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between border-t border-(--borde) pt-4">
            <span className="text-sm font-semibold text-(--texto-suave)">Total de la venta</span>
            <span id="vta-total" className="text-2xl font-bold text-(--texto)">{MONEDA.format(totalCarrito)}</span>
          </div>

          {carrito.length > 0 && discriminaIva(config) && (
            <p id="vta-desglose" className="-mt-2 text-right text-xs text-(--texto-suave)">
              {"Neto " + MONEDA.format(redondear(desgloseCarrito.neto)) + " · IVA incluido " + MONEDA.format(redondear(desgloseCarrito.iva))}
            </p>
          )}
          {sinCostoCarrito.length > 0 && (
            <p id="vta-aviso-costo" className="text-xs text-(--viz-naranja-texto)" role="status">
              <i className="fa-solid fa-triangle-exclamation mr-1" />
              {sinCostoCarrito.length === 1 ? "Un producto de esta venta no tiene" : sinCostoCarrito.length + " productos de esta venta no tienen"} costo cargado: la ganancia de esta venta quedará incompleta.
            </p>
          )}

          <p id="vta-mensaje" className={claseMensaje(avisoVenta)} role="status">{avisoVenta?.texto}</p>

          <button
            id="vta-registrar"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-(--acento-hover) px-6 py-3 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--texto) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-(--acento-hover)"
            type="submit"
            disabled={carrito.length === 0}
          >
            <i className="fa-solid fa-check text-xs" /> Registrar venta
          </button>
        </form>

        {/* Registrar gasto */}
        <form
          id="gasto-form"
          className="flex flex-col gap-4 border-t border-(--borde) pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          noValidate
          onSubmit={registrarGasto}
        >
          <h3 className="text-lg font-bold text-(--texto)">Registrar gasto del día</h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-(--texto)" htmlFor="gasto-categoria">Tipo de gasto</label>
            <div className="relative">
              <select
                id="gasto-categoria"
                className="w-full cursor-pointer appearance-none rounded-full border border-(--borde) bg-(--fondo) py-3 pl-4 pr-10 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <i className="fa-solid fa-chevron-down pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-(--texto)" htmlFor="gasto-detalle">Detalle <span className="font-normal text-(--texto-suave)">(opcional)</span></label>
            <input
              id="gasto-detalle"
              className="w-full rounded-full border border-(--borde) bg-(--fondo) px-4 py-3 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              type="text"
              maxLength={60}
              placeholder="Ej: Boleta de luz"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-(--texto)" htmlFor="gasto-monto">Monto ($)</label>
            <input
              id="gasto-monto"
              className="w-full rounded-full border border-(--borde) bg-(--fondo) px-4 py-3 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>

          <p id="gasto-mensaje" className={claseMensaje(avisoGasto)} role="status">{avisoGasto?.texto}</p>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-full border border-(--borde) px-6 py-3 text-sm font-semibold text-(--texto) cursor-pointer transition hover:border-(--acento) hover:text-(--acento-hover)"
            type="submit"
          >
            <i className="fa-solid fa-plus text-xs" /> Agregar gasto
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-6 border-t border-(--borde) px-5 pb-6 pt-5 sm:px-6 lg:grid-cols-2 lg:gap-8">
        <div>
          <h3 className="text-lg font-bold text-(--texto)">Ventas del día</h3>
          <ul id="vta-lista" className="mt-3 divide-y divide-(--borde)">
            {deDia.slice().reverse().map((v) => (
              <li key={v.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-(--texto)">
                    {v.items.map((it) => it.cantidad + " × " + it.nombre).join(", ")}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-(--texto-suave)">
                    <span>{v.hora + " h"}</span>
                    <span className="rounded-full bg-(--fondo) px-2 py-0.5 font-medium ring-1 ring-(--borde)">{v.metodo}</span>
                    {v.neto !== null && v.iva > 0 && <span data-desglose>{"Neto " + MONEDA.format(v.neto) + " · IVA " + MONEDA.format(v.iva)}</span>}
                    {v.costo && !v.costo.completo && (
                      <span className="rounded-full bg-(--viz-naranja-fondo) px-2 py-0.5 font-medium text-(--viz-naranja-texto)" title="Algún producto no tenía costo cargado al vender">Costo pendiente</span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-semibold text-(--texto)">{MONEDA.format(v.total)}</span>
                <BotonQuitar
                  etiqueta={"Eliminar venta de las " + v.hora}
                  onClick={() => {
                    if (window.confirm("¿Eliminar esta venta?")) eliminarVenta(v.id);
                  }}
                />
              </li>
            ))}
          </ul>
          {deDia.length === 0 && (
            <p id="vta-lista-vacia" className="mt-3 text-sm text-(--texto-suave)">No hay ventas registradas en este día.</p>
          )}
        </div>
        <div className="border-t border-(--borde) pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="text-lg font-bold text-(--texto)">Gastos del día</h3>
          <ul id="gasto-lista" className="mt-3 divide-y divide-(--borde)">
            {gastosDia.slice().reverse().map((g) => (
              <li key={g.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-(--texto)">{g.categoria}</p>
                  {g.detalle && <p className="mt-0.5 text-xs text-(--texto-suave)">{g.detalle}</p>}
                </div>
                <span className="text-sm font-semibold text-(--viz-naranja-texto)">{"− " + MONEDA.format(g.monto)}</span>
                <BotonQuitar
                  etiqueta={"Eliminar gasto " + g.categoria}
                  onClick={() => {
                    if (window.confirm("¿Eliminar este gasto?")) eliminarGasto(g.id);
                  }}
                />
              </li>
            ))}
          </ul>
          {gastosDia.length === 0 && (
            <p id="gasto-lista-vacia" className="mt-3 text-sm text-(--texto-suave)">No hay gastos registrados en este día.</p>
          )}
        </div>
      </div>
    </SeccionDashboard>
  );
}
