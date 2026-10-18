import { useEffect, useMemo, useRef, useState } from "react";
import {
  TIPOS_COMPROBANTE,
  costoPromedioPonderado,
  daCreditoFiscal,
  discriminaIva,
  lineaDeCompra,
  redondear,
} from "../lib/impuestos.js";
import { MONEDA, iso } from "../store/finanzas.js";

const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";
const EDITOR_VACIO = { productoId: "", cantidad: "1", costo: "", alicuota: "" };
const aTexto = (n) => String(n).replace(".", ",");
const etiquetaAlicuota = (a) => (a === 0 ? "Exento (0 %)" : aTexto(a) + " %");
const aNumero = (t) => Number(String(t).trim().replace(",", "."));
const dinero4 = (n) => (n === null ? "pendiente" : MONEDA.format(n));

/**
 * Formulario de nueva compra (diálogo). `abierto` lo maneja quien lo usa; al cerrarse se llama a alCerrar.
 * alGuardar(datos) recibe el cuerpo que espera la API (/api/compras) y devuelve una promesa con true/false.
 */
export default function FormularioCompra({ abierto, alCerrar, productos, proveedores, config, alGuardar }) {
  const ref = useRef(null);
  const conIva = discriminaIva(config);
  const tipoPorDefecto = conIva ? "factura_a" : "sin_comprobante";

  const [fecha, setFecha] = useState(() => iso());
  const [proveedorId, setProveedorId] = useState("");
  const [tipo, setTipo] = useState(tipoPorDefecto);
  const [numero, setNumero] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState([]);
  const [editor, setEditor] = useState(EDITOR_VACIO);
  const [sinIva, setSinIva] = useState(false); // compra sin factura o a un proveedor que no cobra IVA
  const [pago, setPago] = useState("ahora");
  const [metodo, setMetodo] = useState("Efectivo");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Se abre y se cierra según `abierto`; al abrir arranca de cero
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      setFecha(iso());
      setProveedorId("");
      setTipo(tipoPorDefecto);
      setNumero("");
      setNotas("");
      setLineas([]);
      setEditor(EDITOR_VACIO);
      setSinIva(false);
      setPago("ahora");
      setMetodo("Efectivo");
      setError("");
      d.showModal();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto, tipoPorDefecto]);

  const credito = daCreditoFiscal(tipo, config);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Cada renglón con su cálculo y cómo quedaría el costo promedio (los renglones del mismo producto se encadenan)
  const detalle = useMemo(() => {
    const estado = new Map();
    return lineas.map((l) => {
      const p = porId.get(l.productoId);
      const alicuota = sinIva ? 0 : l.alicuota !== "" ? Number(l.alicuota) : (p?.alicuotaIva ?? null);
      const calc = lineaDeCompra({ cantidad: l.cantidad, costoUnitarioConIva: l.costo, alicuota, computaCredito: credito }, config);
      const previo = estado.get(l.productoId) ?? { stock: p?.stock ?? 0, costo: p?.costo ?? null };
      const prom = costoPromedioPonderado({
        stockActual: previo.stock,
        costoActual: previo.costo,
        cantidadNueva: l.cantidad,
        costoNuevo: calc.costoUnitario,
      });
      estado.set(l.productoId, { stock: previo.stock + l.cantidad, costo: prom.costo });
      return { ...l, producto: p, calc, costoAntes: previo.costo, costoDespues: prom.costo, pendiente: previo.stock > 0 && previo.costo === null };
    });
  }, [lineas, porId, config, credito, sinIva]);

  const totales = detalle.reduce(
    (s, l) => ({ total: s.total + l.calc.total, neto: s.neto + l.calc.neto, iva: s.iva + l.calc.iva, credito: s.credito + l.calc.creditoFiscal }),
    { total: 0, neto: 0, iva: 0, credito: 0 },
  );

  // "Sin IVA discriminado": el comprobante pasa a "Sin comprobante" y cada renglón a alícuota 0 (exento).
  // No genera crédito fiscal y el costo es todo lo pagado; la compra se registra completa (stock, costo, pagos).
  function alternarSinIva(activo) {
    setSinIva(activo);
    setTipo(activo ? "sin_comprobante" : tipoPorDefecto);
  }

  function elegirProducto(valor) {
    const p = porId.get(Number(valor));
    setEditor({ productoId: valor, cantidad: editor.cantidad, costo: p && p.costoConIva !== null ? String(p.costoConIva) : "", alicuota: "" });
  }

  function agregarLinea() {
    const productoId = Number(editor.productoId);
    const cantidad = Number(editor.cantidad);
    const costo = aNumero(editor.costo);
    if (!productoId) return setError("Elegí un producto.");
    if (!Number.isInteger(cantidad) || cantidad < 1) return setError("La cantidad tiene que ser un número entero de 1 o más.");
    if (editor.costo.trim() === "" || !Number.isFinite(costo) || costo < 0) return setError("Escribí el costo por unidad, con el IVA incluido.");
    setError("");
    setLineas((actual) => [...actual, { clave: Date.now() + Math.random(), productoId, cantidad, costo, alicuota: editor.alicuota }]);
    setEditor(EDITOR_VACIO);
  }

  async function enviar(e) {
    e.preventDefault();
    if (lineas.length === 0) return setError("Agregá al menos un producto a la compra.");
    if (pago === "pagar" && !proveedorId) return setError("Para dejar la compra a pagar, elegí el proveedor: la deuda es con él.");
    setError("");
    const datos = {
      fecha: fecha || iso(),
      ...(proveedorId ? { proveedor_id: Number(proveedorId) } : {}),
      tipo_comprobante: tipo,
      ...(numero.trim() ? { numero_comprobante: numero.trim() } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      items: lineas.map((l) => ({
        producto_id: l.productoId,
        cantidad: l.cantidad,
        costo_unitario_con_iva: l.costo,
        ...(sinIva ? { alicuota_iva: 0 } : l.alicuota !== "" ? { alicuota_iva: Number(l.alicuota) } : {}),
      })),
      pago: pago === "ahora" ? { metodo } : null,
    };
    setEnviando(true);
    const exito = await alGuardar(datos);
    setEnviando(false);
    if (exito) alCerrar();
  }

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      className="m-auto w-[min(95vw,44rem)] max-h-[94vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      aria-labelledby="titulo-nueva-compra"
    >
      <form className="flex flex-col gap-4 p-5 sm:p-6" noValidate onSubmit={enviar}>
        <h3 id="titulo-nueva-compra" className="text-lg font-bold">Nueva compra</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="cmp-fecha">Fecha</label>
            <input id="cmp-fecha" className={CLASE_INPUT} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="cmp-proveedor">Proveedor</label>
            <select id="cmp-proveedor" className={CLASE_INPUT} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor (compra al contado)</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="cmp-tipo">Comprobante</label>
            <select id="cmp-tipo" className={CLASE_INPUT} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={sinIva}>
              {Object.entries(TIPOS_COMPROBANTE).map(([clave, texto]) => (
                <option key={clave} value={clave}>{texto}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="cmp-numero">Número <span className="font-normal text-(--texto-suave)">(opcional)</span></label>
            <input id="cmp-numero" className={CLASE_INPUT} type="text" maxLength={40} placeholder="0001-00001234" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
        </div>
        {conIva && (
          <label className="flex items-start gap-2 text-sm" data-sin-iva>
            <input id="cmp-sin-iva" type="checkbox" className="mt-0.5 size-4 accent-(--viz-azul)" checked={sinIva} onChange={(e) => alternarSinIva(e.target.checked)} />
            <span>
              <strong>Sin IVA discriminado</strong>
              <span className="text-(--texto-suave)"> — compra sin factura o a un proveedor que no cobra IVA</span>
            </span>
          </label>
        )}
        <p className="-mt-2 text-xs text-(--texto-suave)" data-ayuda-comprobante>
          {sinIva
            ? "No se calcula IVA ni crédito fiscal: el costo es todo lo que pagaste. La compra se registra completa (stock, costo y pagos)."
            : credito
            ? "Con Factura A, el IVA de esta compra es crédito fiscal: se descuenta del IVA de tus ventas y el costo es el neto."
            : conIva
              ? "Este comprobante no da crédito fiscal: el IVA es parte del costo."
              : "Con tu condición fiscal el IVA de las compras no se recupera: es parte del costo."}
        </p>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-(--borde) p-3.5">
          <legend className="px-1 text-sm font-semibold">Productos comprados</legend>
          <div className={"grid gap-3 sm:items-end " + (conIva ? "sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_8rem_auto]" : "sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_auto]")}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--texto-suave)" htmlFor="cmp-producto">Producto</label>
              <select id="cmp-producto" className={CLASE_INPUT} value={editor.productoId} onChange={(e) => elegirProducto(e.target.value)}>
                <option value="">Elegir…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre + " (" + p.sku + ") — stock " + p.stock}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--texto-suave)" htmlFor="cmp-cantidad">Cantidad</label>
              <input id="cmp-cantidad" className={CLASE_INPUT} type="number" min="1" step="1" inputMode="numeric" value={editor.cantidad} onChange={(e) => setEditor((x) => ({ ...x, cantidad: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--texto-suave)" htmlFor="cmp-costo">Costo c/u (IVA incl.)</label>
              <input id="cmp-costo" className={CLASE_INPUT} type="text" inputMode="decimal" placeholder="0,00" autoComplete="off" value={editor.costo} onChange={(e) => setEditor((x) => ({ ...x, costo: e.target.value }))} />
            </div>
            {conIva && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-(--texto-suave)" htmlFor="cmp-alicuota">IVA</label>
                <select id="cmp-alicuota" className={CLASE_INPUT} value={sinIva ? "0" : editor.alicuota} onChange={(e) => setEditor((x) => ({ ...x, alicuota: e.target.value }))} disabled={sinIva}>
                  <option value="">Del producto</option>
                  {config.alicuotasIva.map((a) => (
                    <option key={a} value={a}>{etiquetaAlicuota(a)}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" id="cmp-agregar" className="rounded-full border border-(--borde) px-4 py-2.5 text-sm font-medium cursor-pointer hover:border-(--acento) hover:text-(--acento-hover)" onClick={agregarLinea}>
              <i className="fa-solid fa-plus mr-1.5 text-xs" />Agregar
            </button>
          </div>

          {detalle.length === 0 ? (
            <p className="text-sm text-(--texto-suave)">Todavía no agregaste productos.</p>
          ) : (
            <ul id="cmp-lineas" className="divide-y divide-(--borde) rounded-lg border border-(--borde)">
              {detalle.map((l) => (
                <li key={l.clave} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.cantidad + " × " + (l.producto?.nombre ?? "producto")}</p>
                    <p className="text-xs text-(--texto-suave)">
                      {MONEDA.format(l.calc.costoUnitarioConIva) + " c/u"}
                      {conIva ? " · IVA " + aTexto(l.calc.alicuota) + " %" : ""}
                    </p>
                    <p className={"text-xs " + (l.pendiente ? "text-(--viz-naranja-texto)" : "text-(--texto-suave)")} data-costo-linea>
                      {l.pendiente
                        ? "Este producto tiene stock sin costo cargado: su costo promedio quedará pendiente hasta que lo cargues."
                        : "Costo promedio: " + dinero4(l.costoAntes) + " → " + dinero4(l.costoDespues)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{MONEDA.format(l.calc.total)}</span>
                  <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer hover:bg-(--stock-agotado)/10 hover:text-(--stock-agotado)" aria-label={"Quitar " + (l.producto?.nombre ?? "producto") + " de la compra"} onClick={() => setLineas((a) => a.filter((x) => x.clave !== l.clave))}>
                    <i className="fa-regular fa-trash-can text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-col items-end gap-0.5 border-t border-(--borde) pt-3 text-sm" data-totales>
          {conIva && detalle.length > 0 && (
            <>
              <span className="text-(--texto-suave)">{"Neto " + MONEDA.format(redondear(totales.neto)) + " · IVA " + MONEDA.format(redondear(totales.iva))}</span>
              {credito && <span className="text-(--texto-suave)">{"Crédito fiscal " + MONEDA.format(redondear(totales.credito))}</span>}
            </>
          )}
          <span className="text-base font-bold">{"Total " + MONEDA.format(redondear(totales.total))}</span>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Pago</legend>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input className="size-4 accent-(--acento-hover)" type="radio" name="cmp-pago" checked={pago === "ahora"} onChange={() => setPago("ahora")} />
            Pagada ahora, con
            <select aria-label="Método de pago" className="rounded-lg border border-(--borde) bg-(--fondo) px-2 py-1 text-sm" value={metodo} onChange={(e) => setMetodo(e.target.value)} disabled={pago !== "ahora"}>
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Tarjeta</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input className="size-4 accent-(--acento-hover)" type="radio" name="cmp-pago" checked={pago === "pagar"} onChange={() => setPago("pagar")} />
            A pagar (queda como deuda con el proveedor)
          </label>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="cmp-notas">Notas <span className="font-normal text-(--texto-suave)">(opcional)</span></label>
          <input id="cmp-notas" className={CLASE_INPUT} type="text" maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={alCerrar}>Cancelar</button>
          <button id="cmp-registrar" className="rounded-full bg-(--acento-hover) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto) disabled:cursor-wait disabled:opacity-60" type="submit" disabled={enviando}>
            {enviando ? "Registrando…" : "Registrar compra"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
