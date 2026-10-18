import { useEffect, useRef, useState } from "react";
import { discriminaIva } from "../lib/impuestos.js";
import { MONEDA, iso } from "../store/finanzas.js";

const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";
export const fechaCorta = (f) => f.split("-").reverse().join("/");

export const ESTADOS_PAGO = {
  a_pagar: { texto: "A pagar", clases: "bg-(--viz-naranja-fondo) text-(--viz-naranja-texto)" },
  parcial: { texto: "Pago parcial", clases: "bg-(--viz-naranja-fondo) text-(--viz-naranja-texto)" },
  pagada: { texto: "Pagada", clases: "bg-(--viz-verde-fondo) text-(--viz-verde-texto)" },
  anulada: { texto: "Anulada", clases: "bg-(--viz-gris-fondo) text-(--viz-gris-texto)" },
};

/** Etiqueta para las compras de un Responsable Inscripto en las que no se discriminó IVA (sin factura o proveedor que no cobra IVA). */
export function InsigniaSinIva({ compra }) {
  if (compra.condicionFiscal !== "responsable_inscripto" || compra.iva !== 0 || compra.estado !== "activa") return null;
  return (
    <span className="inline-block rounded-full bg-(--viz-gris-fondo) px-2.5 py-0.5 text-xs font-semibold text-(--viz-gris-texto)" data-sin-iva-etiqueta>
      Sin IVA discriminado
    </span>
  );
}

export function InsigniaPago({ estado }) {
  const e = ESTADOS_PAGO[estado];
  return <span className={"inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold " + e.clases}>{e.texto}</span>;
}

/**
 * Detalle de una compra (diálogo): renglones, pagos, registrar un pago y anular (la compra o un pago).
 * `compra` es la compra a mostrar (o null = cerrado). acciones: { pagar, anularPago, anular }.
 */
export default function DetalleCompra({ compra, alCerrar, acciones, config }) {
  const ref = useRef(null);
  const conIva = discriminaIva(config);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Efectivo");
  const [fecha, setFecha] = useState(() => iso());
  const [accion, setAccion] = useState(null); // { tipo: 'compra' | 'pago', id }
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const id = compra?.id ?? null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id !== null && !d.open) d.showModal();
    else if (id === null && d.open) d.close();
  }, [id]);

  // Al abrir otra compra se limpia todo
  useEffect(() => {
    setMonto("");
    setMetodo("Efectivo");
    setFecha(iso());
    setAccion(null);
    setMotivo("");
    setError("");
  }, [id]);

  async function registrarPago(e) {
    e.preventDefault();
    const valor = Number(String(monto).trim().replace(",", "."));
    if (!(valor > 0)) return setError("Escribí el monto del pago.");
    if (valor > compra.saldo) return setError("El pago no puede superar el saldo pendiente (" + MONEDA.format(compra.saldo) + ").");
    setError("");
    setOcupado(true);
    const exito = await acciones.pagar(compra.id, { fecha: fecha || iso(), metodo, monto: valor });
    setOcupado(false);
    if (exito) setMonto("");
  }

  async function confirmarAnulacion(e) {
    e.preventDefault();
    if (!motivo.trim()) return setError("Escribí el motivo de la anulación.");
    setError("");
    setOcupado(true);
    const exito = accion.tipo === "compra" ? await acciones.anular(compra.id, motivo.trim()) : await acciones.anularPago(accion.id, motivo.trim());
    setOcupado(false);
    if (exito) {
      setAccion(null);
      setMotivo("");
    }
  }

  const activa = compra?.estado === "activa";
  const pagosActivos = compra ? compra.pagos.filter((p) => p.estado === "activo") : [];

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      className="m-auto w-[min(95vw,42rem)] max-h-[94vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      aria-labelledby="titulo-detalle-compra"
    >
      {compra && (
        <div className="flex max-h-[94vh] flex-col gap-4 overflow-y-auto p-5 sm:p-6" data-detalle-compra>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="titulo-detalle-compra" className="text-lg font-bold">{"Compra #" + compra.id}</h3>
              <p className="text-sm text-(--texto-suave)">
                {fechaCorta(compra.fecha) + " · " + (compra.proveedor || "Sin proveedor") + " · " + compra.tipoTexto + (compra.numero ? " " + compra.numero : "")}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-1.5">
              <InsigniaSinIva compra={compra} />
              <InsigniaPago estado={compra.estadoPago} />
            </span>
          </div>
          {compra.notas && <p className="text-sm text-(--texto-suave)">{compra.notas}</p>}
          {!activa && (
            <p className="rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2 text-sm" role="status">
              Compra anulada. Motivo: <strong>{compra.motivoAnulacion}</strong>. El stock y el costo volvieron a lo que eran antes.
            </p>
          )}

          <ul className="divide-y divide-(--borde) rounded-lg border border-(--borde)">
            {compra.items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.cantidad + " × " + i.nombre}</p>
                  <p className="text-xs text-(--texto-suave)">{MONEDA.format(i.costoUnitarioConIva) + " c/u" + (conIva ? " · IVA " + String(i.alicuotaIva).replace(".", ",") + " %" : "")}</p>
                </div>
                <span className="text-sm font-semibold">{MONEDA.format(i.total)}</span>
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-totales-compra>
            {conIva && (
              <>
                <div><dt className="text-xs text-(--texto-suave)">Neto</dt><dd className="font-semibold">{MONEDA.format(compra.neto)}</dd></div>
                <div><dt className="text-xs text-(--texto-suave)">IVA</dt><dd className="font-semibold">{MONEDA.format(compra.iva)}</dd></div>
                <div><dt className="text-xs text-(--texto-suave)">Crédito fiscal</dt><dd className="font-semibold">{MONEDA.format(compra.creditoFiscal)}</dd></div>
              </>
            )}
            <div><dt className="text-xs text-(--texto-suave)">Total</dt><dd className="font-bold">{MONEDA.format(compra.total)}</dd></div>
          </dl>

          <div>
            <h4 className="text-sm font-bold">Pagos</h4>
            {compra.pagos.length === 0 ? (
              <p className="mt-1 text-sm text-(--texto-suave)">Todavía no se registró ningún pago.</p>
            ) : (
              <ul className="mt-1 divide-y divide-(--borde)" id="detalle-pagos">
                {compra.pagos.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className={"min-w-0 flex-1 " + (p.estado === "anulado" ? "text-(--texto-suave) line-through" : "")}>
                      {fechaCorta(p.fecha) + " · " + p.metodo}
                      {p.estado === "anulado" && <span className="no-underline"> (anulado: {p.motivoAnulacion})</span>}
                    </span>
                    <span className={"font-semibold " + (p.estado === "anulado" ? "text-(--texto-suave) line-through" : "")}>{MONEDA.format(p.monto)}</span>
                    {activa && p.estado === "activo" && (
                      <button type="button" className="rounded-full border border-(--borde) px-3 py-1 text-xs font-medium cursor-pointer hover:border-(--stock-agotado) hover:text-(--stock-agotado)" onClick={() => { setAccion({ tipo: "pago", id: p.id }); setMotivo(""); setError(""); }}>
                        Anular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {activa && (
              <p className="mt-1 text-sm" data-saldo>
                Pagado {MONEDA.format(compra.pagado)} · Saldo pendiente <strong>{MONEDA.format(compra.saldo)}</strong>
              </p>
            )}
          </div>

          {activa && compra.saldo > 0 && !accion && (
            <form className="grid gap-2 rounded-lg border border-(--borde) bg-(--fondo) p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={registrarPago} noValidate>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-(--texto-suave)" htmlFor="pago-monto">Monto del pago</label>
                <input id="pago-monto" className={CLASE_INPUT} type="text" inputMode="decimal" placeholder={String(compra.saldo).replace(".", ",")} autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-(--texto-suave)" htmlFor="pago-metodo">Método</label>
                <select id="pago-metodo" className={CLASE_INPUT} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>Tarjeta</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-(--texto-suave)" htmlFor="pago-fecha">Fecha</label>
                <input id="pago-fecha" className={CLASE_INPUT} type="date" min={compra.fecha} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <button type="submit" className="rounded-full bg-(--acento-hover) px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto) disabled:opacity-60" disabled={ocupado}>Registrar pago</button>
            </form>
          )}

          {accion && (
            <form className="flex flex-col gap-2 rounded-lg border border-(--stock-agotado)/40 bg-(--fondo) p-3" onSubmit={confirmarAnulacion} noValidate data-anulacion>
              <p className="text-sm font-semibold">{accion.tipo === "compra" ? "Anular la compra #" + compra.id : "Anular el pago"}</p>
              <p className="text-xs text-(--texto-suave)">
                {accion.tipo === "compra"
                  ? "Se devuelve el stock y se restaura el costo anterior de cada producto. La compra queda registrada como anulada, no se borra." +
                    (pagosActivos.length > 0 ? " También se anulan sus " + pagosActivos.length + (pagosActivos.length === 1 ? " pago" : " pagos") + " (" + MONEDA.format(compra.pagado) + "): si ya lo pagaste, ese dinero lo tenés que recuperar del proveedor." : "")
                  : "El pago queda registrado como anulado y el saldo de la compra aumenta."}
              </p>
              <label className="text-xs font-medium text-(--texto-suave)" htmlFor="anular-motivo">Motivo (obligatorio)</label>
              <input id="anular-motivo" className={CLASE_INPUT} type="text" maxLength={200} autoComplete="off" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-full border border-(--borde) px-4 py-1.5 text-sm font-medium cursor-pointer hover:bg-(--superficie)" onClick={() => { setAccion(null); setError(""); }}>Volver</button>
                <button type="submit" className="rounded-full bg-(--stock-agotado) px-4 py-1.5 text-sm font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-60" disabled={ocupado}>
                  {accion.tipo === "compra" ? "Anular compra" : "Anular pago"}
                </button>
              </div>
            </form>
          )}

          {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            {activa && !accion ? (
              <button type="button" id="detalle-anular" className="rounded-full border border-(--stock-agotado)/50 px-4 py-2 text-sm font-medium text-(--stock-agotado) cursor-pointer hover:bg-(--stock-agotado)/10" onClick={() => { setAccion({ tipo: "compra" }); setMotivo(""); setError(""); }}>
                Anular compra
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" onClick={alCerrar}>Cerrar</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
