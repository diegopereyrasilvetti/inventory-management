import { useState } from "react";
import DetalleCompra, { InsigniaPago, InsigniaSinIva, fechaCorta } from "../../components/DetalleCompra.jsx";
import FormularioCompra from "../../components/FormularioCompra.jsx";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import useTitulo from "../../hooks/useTitulo.js";
import { discriminaIva, redondear } from "../../lib/impuestos.js";
import { useCatalogo } from "../../store/catalogo.js";
import { useCompras } from "../../store/compras.js";
import { useConfiguracionFiscal } from "../../store/configuracionFiscal.js";
import { MONEDA, iso } from "../../store/finanzas.js";
import { useProveedores } from "../../store/proveedores.js";

const CLASE_SELECT =
  "rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";

function Tarjeta({ icono, titulo, valor, id }) {
  return (
    <div className="rounded-xl border border-(--borde) bg-(--fondo) p-3 sm:p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave)"><i className={icono} aria-hidden="true" /> {titulo}</dt>
      <dd id={id} className="mt-1.5 text-xl font-bold text-(--texto) sm:text-2xl">{valor}</dd>
    </div>
  );
}

/** Compras: comprobantes de proveedores. Suman stock, actualizan el costo promedio y generan deuda o pagos. */
export default function Compras() {
  useTitulo("Compras | Gestión de Stock");
  const { compras, cargando, disponible, registrar, pagar, anularPago, anular } = useCompras();
  const { catalogo } = useCatalogo();
  const { proveedores } = useProveedores();
  const { config } = useConfiguracionFiscal();
  const conIva = discriminaIva(config);

  const [nueva, setNueva] = useState(false);
  const [verId, setVerId] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");

  const mes = iso().slice(0, 7);
  const activas = compras.filter((c) => c.estado === "activa");
  const delMes = activas.filter((c) => c.fecha.startsWith(mes));
  const aPagar = redondear(activas.reduce((s, c) => s + c.saldo, 0));
  const creditoMes = redondear(delMes.reduce((s, c) => s + c.creditoFiscal, 0));

  const visibles = compras.filter(
    (c) =>
      (!filtroEstado || c.estadoPago === filtroEstado) &&
      (!filtroProveedor || (filtroProveedor === "ninguno" ? !c.proveedorId : String(c.proveedorId) === filtroProveedor)),
  );
  const seleccionada = verId === null ? null : (compras.find((c) => c.id === verId) ?? null);

  return (
    <SeccionDashboard aria-labelledby="titulo-compras">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="titulo-compras" className="text-xl font-bold text-(--texto)">Compras</h2>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Lo que le comprás a tus proveedores: suma stock, actualiza el costo y registra lo que pagás o debés.</p>
        </div>
        <button
          id="compras-nueva"
          className="inline-flex items-center gap-2 rounded-full bg-(--acento-hover) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--texto) disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!disponible}
          onClick={() => setNueva(true)}
        >
          <i className="fa-solid fa-plus text-xs" /> Nueva compra
        </button>
      </div>

      {!disponible && !cargando && (
        <p className="mx-5 mt-4 rounded-lg border border-(--stock-agotado)/40 bg-(--fondo) px-4 py-3 text-sm text-(--stock-agotado) sm:mx-6" role="alert">
          Todavía no se crearon las tablas de compras en la base de datos. Un administrador tiene que ejecutar el script
          10_compras.sql en Supabase.
        </p>
      )}

      <dl className={"grid grid-cols-2 gap-2 px-5 pt-4 sm:gap-4 sm:px-6 " + (conIva ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <Tarjeta id="resumen-mes" icono="fa-solid fa-bag-shopping text-(--viz-violeta)" titulo="Comprado en el mes" valor={MONEDA.format(redondear(delMes.reduce((s, c) => s + c.total, 0)))} />
        <Tarjeta id="resumen-cantidad" icono="fa-solid fa-file-invoice text-(--viz-verde)" titulo="Compras del mes" valor={delMes.length} />
        <Tarjeta id="resumen-deuda" icono="fa-solid fa-hand-holding-dollar text-(--viz-naranja)" titulo="A pagar a proveedores" valor={MONEDA.format(aPagar)} />
        {conIva && <Tarjeta id="resumen-credito" icono="fa-solid fa-percent text-(--viz-violeta)" titulo="Crédito fiscal del mes" valor={MONEDA.format(creditoMes)} />}
      </dl>

      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 sm:px-6">
        <label className="sr-only" htmlFor="filtro-estado">Estado de pago</label>
        <select id="filtro-estado" className={CLASE_SELECT} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todas</option>
          <option value="a_pagar">A pagar</option>
          <option value="parcial">Pago parcial</option>
          <option value="pagada">Pagadas</option>
          <option value="anulada">Anuladas</option>
        </select>
        <label className="sr-only" htmlFor="filtro-proveedor">Proveedor</label>
        <select id="filtro-proveedor" className={CLASE_SELECT} value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)}>
          <option value="">Todos los proveedores</option>
          <option value="ninguno">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      <div className="px-5 pb-5 pt-3 sm:px-6">
        <ul id="compras-lista" className="divide-y divide-(--borde)">
          {visibles.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5" data-compra={c.id}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-semibold text-(--texto)">
                  {"#" + c.id + " · " + fechaCorta(c.fecha)}
                  <span className="font-normal text-(--texto-suave)">{" · " + (c.proveedor || "Sin proveedor")}</span>
                </p>
                <p className="text-xs text-(--texto-suave)">
                  {c.tipoTexto + (c.numero ? " " + c.numero : "") + " · " + c.items.map((i) => i.cantidad + " × " + i.nombre).join(", ")}
                </p>
              </div>
              <div className="text-right">
                <p className={"text-sm font-bold " + (c.estado === "anulada" ? "text-(--texto-suave) line-through" : "text-(--texto)")}>{MONEDA.format(c.total)}</p>
                {c.estado === "activa" && c.saldo > 0 && <p className="text-xs text-(--viz-naranja-texto)">{"Debés " + MONEDA.format(c.saldo)}</p>}
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                <InsigniaSinIva compra={c} />
                <InsigniaPago estado={c.estadoPago} />
              </span>
              <button
                type="button"
                className="rounded-full border border-(--borde) px-4 py-1.5 text-sm font-medium cursor-pointer hover:border-(--acento) hover:text-(--acento-hover)"
                aria-label={"Ver la compra #" + c.id}
                onClick={() => setVerId(c.id)}
              >
                Ver
              </button>
            </li>
          ))}
        </ul>
        {!cargando && disponible && visibles.length === 0 && (
          <p className="py-8 text-center text-sm text-(--texto-suave)">
            {compras.length === 0 ? 'Todavía no registraste compras. Tocá "Nueva compra" para empezar.' : "No hay compras con esos filtros."}
          </p>
        )}
      </div>

      <FormularioCompra
        abierto={nueva}
        alCerrar={() => setNueva(false)}
        productos={catalogo}
        proveedores={proveedores.filter((p) => p.activo)}
        config={config}
        alGuardar={registrar}
      />
      <DetalleCompra compra={seleccionada} alCerrar={() => setVerId(null)} acciones={{ pagar, anularPago, anular }} config={config} />
    </SeccionDashboard>
  );
}
