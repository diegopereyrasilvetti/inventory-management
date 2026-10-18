import { useMemo, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { useFinanzas, MONEDA, CATEGORIAS_GASTO, iso } from "../../store/finanzas.js";
import useAviso from "../../hooks/useAviso.js";
import { balancePorPeriodos } from "../../lib/balances.js";
import { useCompras } from "../../store/compras.js";
import { useConfiguracionFiscal } from "../../store/configuracionFiscal.js";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const COLOR_INGRESOS = "bg-(--viz-violeta)";
const COLOR_PICO = "bg-(--viz-azul)";
const COLOR_EGRESOS = "bg-(--viz-naranja)";

/* ---------- Utilidades ---------- */
function mayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function compacto(n) {
  if (n >= 1000000) return "$" + String(+(n / 1000000).toFixed(2)).replace(".", ",") + " M";
  if (n >= 1000) return "$" + String(+(n / 1000).toFixed(1)).replace(".", ",") + " k";
  return "$" + Math.round(n);
}

/* ---------- Datos de ejemplo (solo cuando no hay datos reales, o si se piden a propósito) ---------- */
let cacheEjemplo = null;
function datosEjemplo() {
  const hoy = new Date();
  const clave = iso(hoy);
  if (cacheEjemplo && cacheEjemplo.clave === clave) return cacheEjemplo.mapa;
  const mapa = {};
  for (let atras = 0; atras < 366; atras++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
    const crecimiento = 1 + ((365 - atras) / 365) * 0.9;
    const r1 = Math.abs(Math.sin(atras * 12.9898) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(atras * 78.233) * 12345.6789) % 1;
    const r3 = Math.abs(Math.sin(atras * 39.346) * 98765.4321) % 1;
    // Picos de ejemplo: dos meses de temporada alta y un par de días con ventas muy altas
    const mesesAtras = hoy.getFullYear() * 12 + hoy.getMonth() - (fecha.getFullYear() * 12 + fecha.getMonth());
    let pico = 1;
    if (mesesAtras === 3) pico = 2.1;
    else if (mesesAtras === 1) pico = 1.8;
    if (atras === 2) pico = Math.max(pico, 2.6);
    else if (atras === 9) pico = Math.max(pico, 2.2);
    const ing = Math.round((18000 * crecimiento * pico * (0.7 + 0.6 * r1)) / 1000) * 1000;
    mapa[iso(fecha)] = {
      ing,
      costo: Math.round((ing * (0.53 + 0.06 * r2)) / 100) * 100,
      otros: Math.round((3500 * (0.8 + 0.4 * r3)) / 100) * 100,
    };
  }
  cacheEjemplo = { clave, mapa };
  return mapa;
}

/* ---------- Períodos ---------- */
function periodos(tipo) {
  const hoy = new Date();
  const lista = [];
  if (tipo === "semana") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
      lista.push({
        etiqueta: DIAS[d.getDay()] + " " + d.getDate(),
        titulo: mayuscula(d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })),
        desde: iso(d),
        hasta: iso(d),
      });
    }
  } else if (tipo === "mes") {
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const ultimo = new Date(y, m + 1, 0).getDate();
    [[1, 7], [8, 14], [15, 21], [22, 28], [29, ultimo]].forEach((r) => {
      if (r[0] > ultimo) return;
      const hasta = Math.min(r[1], ultimo);
      lista.push({
        etiqueta: r[0] === hasta ? String(r[0]) : r[0] + "–" + hasta,
        titulo: "Del " + r[0] + " al " + hasta + " de " + MESES[m],
        desde: iso(new Date(y, m, r[0])),
        hasta: iso(new Date(y, m, hasta)),
      });
    });
  } else {
    const cantidad = tipo === "anio" ? 12 : 6;
    for (let i = cantidad - 1; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      lista.push({
        etiqueta: MESES[d.getMonth()],
        titulo: mayuscula(d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })),
        desde: iso(d),
        hasta: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      });
    }
  }
  return lista;
}

function sumar(lista, mapa) {
  const claves = Object.keys(mapa);
  lista.forEach((p) => {
    p.ing = 0;
    p.costo = 0;
    p.otros = 0;
    claves.forEach((k) => {
      if (k >= p.desde && k <= p.hasta) {
        p.ing += mapa[k].ing;
        p.costo += mapa[k].costo;
        p.otros += mapa[k].otros;
      }
    });
    p.egr = p.costo + p.otros;
    p.gan = p.ing - p.egr;
  });
  return lista;
}

function colorGanancia(valor) {
  return valor > 0 ? "text-(--viz-verde-texto)" : valor < 0 ? "text-(--viz-naranja-texto)" : "text-(--texto)";
}

function escala(max) {
  if (max <= 0) return { tope: 1, pasos: 4 };
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  // pasos que dan valores redondos en el eje ($500 k, $1 M, $1,5 M…)
  return { tope: nf * exp, pasos: nf === 1 || nf === 2 ? 4 : 5 };
}

function textoPeriodo(p) {
  return p.titulo + ": ingresos " + MONEDA.format(p.ing) + ", egresos " + MONEDA.format(p.egr);
}

/* ---------- Gráfico ---------- */
function BalancesGrafico({ lista }) {
  const max = lista.reduce((m, p) => Math.max(m, p.ing, p.egr), 0);
  const esc = escala(max);
  const tope = esc.tope;
  const columnas = "repeat(" + lista.length + ", minmax(0, 1fr))";
  const angostas = lista.length > 8;
  const iPico = max > 0 ? lista.reduce((im, p, i) => (p.ing > lista[im].ing ? i : im), 0) : -1;
  const marcas = Array.from({ length: esc.pasos + 1 }, (_, t) => t);

  return (
    <>
      <div className="mt-4 flex gap-2">
        <div
          id="bal-grafico"
          className="relative ml-12 mr-1 h-56 min-w-0 flex-1 sm:ml-14"
          role="img"
          aria-label={"Gráfico de barras de ingresos y gastos. " + lista.map(textoPeriodo).join(". ")}
        >
          {marcas.map((t) => {
            const altura = (t / esc.pasos) * 100;
            return (
              <div key={t}>
                <div
                  className={"absolute inset-x-0 border-t " + (t === 0 ? "border-(--texto-suave)/40" : "border-dashed border-(--borde)")}
                  style={{ bottom: altura + "%" }}
                />
                <span
                  className="absolute right-full mr-2 whitespace-nowrap text-[11px] text-(--texto-suave)"
                  style={{ bottom: altura + "%", transform: "translateY(50%)" }}
                >
                  {compacto((tope * t) / esc.pasos)}
                </span>
              </div>
            );
          })}
          <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: columnas }}>
            {lista.map((p, i) => (
              <div key={p.desde} className="flex h-full items-end justify-center gap-0.5 sm:gap-1" title={textoPeriodo(p)}>
                {[
                  [p.ing, i === iPico && p.ing > 0 ? COLOR_PICO : COLOR_INGRESOS],
                  [p.egr, COLOR_EGRESOS],
                ].map(([valor, color], k) => (
                  <div
                    key={k}
                    className={(angostas ? "w-1.5 sm:w-3 " : "w-2.5 sm:w-4 ") + "rounded-t " + color}
                    style={{ height: valor > 0 ? "max(" + (valor / tope) * 100 + "%, 2px)" : "0" }}
                  />
                ))}
              </div>
            ))}
          </div>
          {max === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-(--texto-suave)">
              Todavía no hay movimientos en este período.
            </p>
          )}
        </div>
      </div>
      <div id="bal-etiquetas" className="ml-12 mr-1 mt-2 grid gap-1 sm:ml-14" style={{ gridTemplateColumns: columnas }}>
        {lista.map((p) => (
          <span key={p.desde} className="truncate text-center text-[10px] text-(--texto-suave) sm:text-xs">
            {p.etiqueta}
          </span>
        ))}
      </div>
    </>
  );
}

export default function Balances() {
  const { ventas, gastos, cargando, agregarGasto } = useFinanzas();
  const { compras, cargando: cargandoCompras } = useCompras();
  const { config, cargando: cargandoConfig } = useConfiguracionFiscal();

  const [periodo, setPeriodo] = useState("6m");
  const [forzarEjemplo, setForzarEjemplo] = useState(null); // null = automático: ejemplo si todavía no hay datos propios

  const [tipo, setTipo] = useState("Otros");
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(() => iso());
  const [aviso, avisar] = useAviso();

  const hayDatos = ventas.length > 0 || gastos.length > 0 || compras.length > 0;
  const ejemplo = forzarEjemplo !== null ? forzarEjemplo : !(cargando || cargandoCompras || cargandoConfig) && !hayDatos;

  // Con datos reales, las cuentas las hace lib/balances.js (IVA, costo histórico, crédito fiscal, fecha de inicio).
  // El ejemplo conserva su propio cálculo y nunca se mezcla con lo real.
  const { lista, totales, legado } = useMemo(() => {
    if (ejemplo) {
      const l = sumar(periodos(periodo), datosEjemplo());
      const t = l.reduce(
        (acc, p) => {
          acc.ing += p.ing;
          acc.costo += p.costo;
          acc.otros += p.otros;
          return acc;
        },
        { ing: 0, costo: 0, otros: 0 },
      );
      t.egr = t.costo + t.otros;
      t.gan = t.ing - t.egr;
      return { lista: l, totales: { ...t, tipo: "ejemplo" }, legado: null };
    }
    return balancePorPeriodos({ ventas, compras, gastos, config, periodos: periodos(periodo) });
  }, [periodo, ejemplo, ventas, compras, gastos, config]);
  const nueva = totales.tipo === "nueva" ? totales.resumen : null;

  const margen = totales.ing > 0 ? (totales.gan / totales.ing) * 100 : null;
  const ancho = margen === null ? 0 : Math.max(0, Math.min(100, margen));

  async function registrarGasto(e) {
    e.preventDefault();
    const valor = parseFloat(monto);
    if (!(valor > 0)) {
      avisar("Ingresá un monto mayor a 0.", false);
      return;
    }
    if (!(await agregarGasto({ fecha: fecha || iso(), categoria: tipo, detalle: detalle.trim(), monto: valor }))) return;
    setForzarEjemplo(false);
    setTipo("Otros");
    setDetalle("");
    setMonto("");
    setFecha(iso());
    avisar("Gasto registrado: " + MONEDA.format(valor) + ".", true);
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-balances">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="titulo-balances" className="text-xl font-bold text-(--texto)">Balances</h2>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Resumen financiero del negocio</p>
        </div>
        <div className="relative">
          <label className="sr-only" htmlFor="bal-periodo">Período</label>
          <select
            id="bal-periodo"
            className="cursor-pointer appearance-none rounded-full border border-(--borde) bg-(--superficie) py-2.5 pl-4 pr-10 text-sm font-medium text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="semana">Semana (7 días)</option>
            <option value="mes">Este mes</option>
            <option value="6m">6 meses</option>
            <option value="anio">Año (12 meses)</option>
          </select>
          <i className="fa-solid fa-chevron-down pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
        </div>
      </div>

      <div
        id="bal-aviso"
        className={
          ejemplo
            ? "mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--viz-naranja)/40 bg-(--viz-naranja-fondo) px-4 py-2.5 text-sm text-(--viz-naranja-texto) sm:mx-6"
            : "mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--borde) bg-(--fondo) px-4 py-2.5 text-sm text-(--texto-suave) sm:mx-6"
        }
      >
        <p id="bal-aviso-texto">
          {ejemplo
            ? "Estás viendo datos de ejemplo. Registrá ventas y gastos para ver tus propios números."
            : "Estás viendo tus ventas, compras y gastos registrados."}
        </p>
        <button
          id="bal-modo"
          className="rounded-full border border-current/40 px-4 py-2 text-xs font-semibold cursor-pointer transition hover:bg-black/5"
          type="button"
          onClick={() => setForzarEjemplo(!ejemplo)}
        >
          {ejemplo ? "Ver mis datos" : "Ver datos de ejemplo"}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2 px-5 pt-4 sm:gap-4 sm:px-6 lg:grid-cols-4">
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-solid fa-arrow-trend-up text-(--viz-violeta)" aria-hidden="true" /> {nueva ? "Ingresos sin IVA" : "Ingresos"}</dt>
          <dd id="bal-ingresos" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(totales.ing)}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-solid fa-cube text-(--viz-naranja)" aria-hidden="true" /> Costo de ventas</dt>
          <dd id="bal-costo" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(totales.costo)}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-solid fa-wallet text-(--viz-naranja)" aria-hidden="true" /> Otros gastos</dt>
          <dd id="bal-otros" className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{MONEDA.format(totales.otros)}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-solid fa-chart-simple text-(--viz-verde)" aria-hidden="true" /> Ganancia estimada</dt>
          <dd id="bal-ganancia" className={"mt-1.5 text-xl font-bold sm:text-2xl " + colorGanancia(totales.gan)}>{MONEDA.format(totales.gan)}</dd>
        </div>
      </dl>

      {!ejemplo && hayDatos && (
        <div id="bal-notas" className="mx-5 mt-3 flex flex-col gap-1.5 rounded-lg border border-(--borde) bg-(--fondo) px-4 py-3 text-sm text-(--texto-suave) sm:mx-6">
          {nueva && (
            <p id="bal-fiscal" className="text-(--texto)">
              {config.condicionFiscal === "responsable_inscripto"
                ? "Facturado " + MONEDA.format(nueva.totalFacturado) + " · IVA incluido " + MONEDA.format(nueva.ivaVentas) + " · Ingresos sin IVA " + MONEDA.format(nueva.ingresosSinIva)
                : "Facturado " + MONEDA.format(nueva.totalFacturado) + " (con tu condición fiscal el IVA no se discrimina: todo es ingreso)"}
            </p>
          )}
          {nueva?.incompleto.costo && (
            <p id="bal-aviso-costo" className="text-(--viz-naranja-texto)">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />
              Falta el costo de {nueva.unidadesSinCosto} {nueva.unidadesSinCosto === 1 ? "unidad vendida" : "unidades vendidas"}: la ganancia está <strong>incompleta</strong> (no se toma como costo cero). Cargalo en Productos.
            </p>
          )}
          {nueva?.incompleto.iva && (
            <p id="bal-aviso-iva" className="text-(--viz-naranja-texto)">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />
              Hay {nueva.ventasSinDesglose.cantidad} {nueva.ventasSinDesglose.cantidad === 1 ? "venta" : "ventas"} sin desglose de IVA ({MONEDA.format(nueva.ventasSinDesglose.total)}): se cuentan completas, sin estimar su IVA.
            </p>
          )}
          {nueva && nueva.gastosMercaderia > 0 && (
            <p id="bal-aviso-mercaderia">
              Cargaste {MONEDA.format(nueva.gastosMercaderia)} como gasto de "Mercadería y proveedores". La mercadería se registra en Compras: revisá que no esté duplicada.
            </p>
          )}
          {nueva && nueva.ventasSinIva.cantidad > 0 && (
            <p id="bal-sin-iva">
              {nueva.ventasSinIva.cantidad} {nueva.ventasSinIva.cantidad === 1 ? "venta" : "ventas"} sin IVA discriminado ({MONEDA.format(nueva.ventasSinIva.total)}): cuentan completas en tus ingresos.
            </p>
          )}
          {legado && (
            <p id="bal-legado">
              Antes de la nueva contabilidad (cálculo anterior, con IVA incluido y sin costo histórico): ingresos {MONEDA.format(legado.ingresos)}, ganancia {MONEDA.format(legado.ganancia)}. No se suma a los totales de arriba.
            </p>
          )}
          {totales.tipo === "anterior" && (
            <p id="bal-aviso-anterior">
              {config.fechaInicioContabilidad
                ? "Este período es anterior a la nueva contabilidad (desde el " + config.fechaInicioContabilidad.split("-").reverse().join("/") + "): se calcula como antes, sin desglose de IVA ni costo histórico."
                : "La nueva contabilidad todavía no está activa: se calcula como antes, sin desglose de IVA. Se activa en Configuración fiscal."}
            </p>
          )}
          <p id="bal-estimacion">Son estimaciones para la gestión interna del negocio, no una liquidación fiscal oficial. Confirmá los valores con tu contador.</p>
        </div>
      )}

      <div className="px-5 pt-6 sm:px-6">
        <h3 className="text-lg font-bold text-(--texto)">Evolución de ingresos y gastos</h3>
        <BalancesGrafico lista={lista} />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-(--texto)">
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-(--viz-violeta)" /> Ingresos</span>
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-(--viz-naranja)" /> Costos y gastos</span>
        </div>
        <p className="mt-3 text-xs text-(--texto-suave)">Valores expresados en pesos argentinos.</p>
      </div>

      <div className="px-5 pt-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-(--texto)">Margen de ganancia estimado</h3>
          <span
            id="bal-margen"
            className={"text-xl font-bold " + (margen !== null && margen < 0 ? "text-(--viz-naranja-texto)" : "text-(--texto)")}
          >
            {margen === null ? "—" : margen.toFixed(1).replace(".", ",") + "%"}
          </span>
        </div>
        <div
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-(--fondo) ring-1 ring-(--borde)"
          role="progressbar"
          aria-label="Margen de ganancia"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ancho)}
          id="bal-barra"
        >
          <div
            id="bal-barra-relleno"
            className="h-full rounded-full bg-(--viz-verde) transition-[width] duration-500"
            style={{ width: ancho + "%" }}
          />
        </div>
      </div>

      <div className="px-5 pt-6 sm:px-6">
        <h3 className="text-lg font-bold text-(--texto)">Detalle de ingresos y egresos</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-(--borde) text-[11px] font-semibold uppercase tracking-wider text-(--texto-suave) sm:text-xs">
                <th className="py-2.5 pr-3" scope="col">Período</th>
                <th className="py-2.5 pr-3 text-right" scope="col">Ingresos</th>
                <th className="py-2.5 pr-3 text-right" scope="col">Egresos</th>
                <th className="py-2.5 text-right" scope="col">Ganancia</th>
              </tr>
            </thead>
            <tbody id="bal-tabla">
              {lista.map((p) => (
                <tr key={p.desde} className="border-b border-(--borde)">
                  <th scope="row" className="py-2.5 pr-3 font-medium text-(--texto) text-left">{p.titulo}</th>
                  <td className="py-2.5 pr-3 text-right text-(--texto)">{MONEDA.format(p.ing)}</td>
                  <td className="py-2.5 pr-3 text-right text-(--texto)">{MONEDA.format(p.egr)}</td>
                  <td className={"py-2.5 text-right font-semibold " + colorGanancia(p.gan)}>{MONEDA.format(p.gan)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-(--borde) font-bold text-(--texto)">
                <th className="py-3 pr-3" scope="row">{legado ? "Total desde la nueva contabilidad" : "Total"}</th>
                <td id="bal-t-ing" className="py-3 pr-3 text-right">{MONEDA.format(totales.ing)}</td>
                <td id="bal-t-egr" className="py-3 pr-3 text-right">{MONEDA.format(totales.egr)}</td>
                <td id="bal-t-gan" className={"py-3 text-right " + colorGanancia(totales.gan)}>{MONEDA.format(totales.gan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 border-t border-(--borde) px-5 pb-6 pt-5 sm:px-6">
        <h3 className="text-lg font-bold text-(--texto)">Registrar gasto adicional</h3>
        <form id="bal-form" className="mt-3 grid gap-4 sm:grid-cols-2" noValidate onSubmit={registrarGasto}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-(--texto)" htmlFor="bal-tipo">Tipo de gasto</label>
            <div className="relative">
              <select
                id="bal-tipo"
                className="w-full cursor-pointer appearance-none rounded-lg border border-(--borde) bg-(--fondo) py-2.5 pl-3 pr-9 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <i className="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-(--texto)" htmlFor="bal-detalle">Detalle <span className="font-normal text-(--texto-suave)">(opcional)</span></label>
            <input
              id="bal-detalle"
              className="w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              type="text"
              maxLength={60}
              placeholder="Ej: Reparación de heladera"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-(--texto)" htmlFor="bal-monto">Monto ($)</label>
            <input
              id="bal-monto"
              className="w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-(--texto)" htmlFor="bal-fecha">Fecha</label>
            <input
              id="bal-fecha"
              className="w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-(--acento-hover) px-6 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--texto) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
              type="submit"
            >
              <i className="fa-solid fa-plus text-xs" /> Registrar gasto
            </button>
            <p
              id="bal-mensaje"
              className={
                aviso
                  ? "text-sm " + (aviso.ok ? "text-(--viz-verde-texto)" : "text-(--stock-agotado)")
                  : "hidden text-sm"
              }
              role="status"
            >
              {aviso?.texto}
            </p>
          </div>
        </form>
      </div>
    </SeccionDashboard>
  );
}
