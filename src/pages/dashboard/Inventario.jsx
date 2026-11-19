import { useEffect, useRef, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { ESTADOS, estadoDe, useInventario } from "../../store/inventario.js";

const CLASE_BOTON_STOCK =
  "flex size-10 lg:size-8 items-center justify-center rounded-full border border-(--borde) text-(--texto) cursor-pointer transition hover:bg-(--fondo) hover:text-(--acento-hover) focus-visible:outline-2 focus-visible:outline-(--acento-hover)";
const CLASE_INPUT_DIALOGO =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";

const FORM_VACIO = { nombre: "", codigo: "", stock: "0", minimo: "10" };

function comoCsv(productos) {
  const celda = (valor) => '"' + String(valor).replace(/"/g, '""') + '"';
  const filas = productos.map((p) =>
    [p.nombre, p.codigo, p.stock, ESTADOS[estadoDe(p)].texto].map(celda).join(","),
  );
  return ["Producto,Código,Stock,Estado"].concat(filas).join("\n");
}

function Fila({ p, onStock, onBorrar }) {
  const estado = ESTADOS[estadoDe(p)];
  return (
    <tr className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-(--borde) py-4 last:border-0 hover:bg-(--fondo)/60 sm:table-row sm:py-0">
      <td className="col-start-1 row-start-1 min-w-0 font-semibold text-(--texto) [overflow-wrap:anywhere] sm:py-3.5 sm:pr-4 sm:font-medium">
        {p.nombre}
      </td>
      <td className="col-start-1 row-start-2 min-w-0 font-mono text-sm text-(--texto-suave) [overflow-wrap:anywhere] sm:py-3.5 sm:pr-4">
        {p.codigo}
      </td>
      <td className="col-span-2 row-start-3 sm:py-3.5 sm:pr-4">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span className="text-xs font-semibold uppercase tracking-wider text-(--texto-suave) sm:hidden">Stock</span>
          <div className="flex items-center gap-1.5">
            <button
              className={CLASE_BOTON_STOCK}
              type="button"
              aria-label={"Restar una unidad de " + p.nombre}
              onClick={() => onStock(p.id, p.stock - 1)}
            >
              <i className="fa-solid fa-minus text-xs"></i>
            </button>
            <input
              className="w-20 rounded-lg border border-transparent bg-transparent py-1 text-center text-lg font-semibold text-(--texto) hover:border-(--borde) focus:border-(--acento) focus:bg-(--superficie) focus:outline-none focus:ring-2 focus:ring-(--acento)/30 sm:w-16 sm:text-base"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue={p.stock}
              key={p.stock}
              aria-label={"Stock de " + p.nombre}
              onBlur={async (e) => {
                const n = parseInt(e.target.value, 10);
                if (n === p.stock) return;
                const exito = await onStock(p.id, n);
                if (!exito) e.target.value = p.stock;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <button
              className={CLASE_BOTON_STOCK}
              type="button"
              aria-label={"Sumar una unidad a " + p.nombre}
              onClick={() => onStock(p.id, p.stock + 1)}
            >
              <i className="fa-solid fa-plus text-xs"></i>
            </button>
          </div>
        </div>
      </td>
      <td className="col-start-2 row-start-2 justify-self-end sm:py-3.5 sm:pr-4">
        <span className={"inline-block rounded-full px-3 py-1 text-xs font-semibold " + estado.clases}>
          {estado.texto}
        </span>
      </td>
      <td className="col-start-2 row-start-1 justify-self-end sm:py-3.5 sm:text-right">
        <button
          className="flex size-10 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition hover:bg-(--stock-agotado)/10 hover:text-(--stock-agotado) lg:size-8"
          type="button"
          aria-label={"Eliminar " + p.nombre}
          onClick={() => onBorrar(p)}
        >
          <i className="fa-regular fa-trash-can text-sm"></i>
        </button>
      </td>
    </tr>
  );
}

export default function Inventario() {
  const { productos, cargando, cambiarStock, agregar, eliminar } = useInventario();
  const dialogo = useRef(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState("");
  const [csv, setCsv] = useState("Copiar CSV");
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function abrirDialogo() {
    setForm(FORM_VACIO);
    setError("");
    dialogo.current.showModal();
  }

  function cambiarCampo(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function guardar(e) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    const codigo = form.codigo.trim().toUpperCase();
    const stock = parseInt(form.stock, 10);
    const minimo = parseInt(form.minimo, 10);

    let mensaje = "";
    if (!nombre || !codigo) {
      mensaje = "Completá el nombre y el código del producto.";
    } else if (!(stock >= 0) || !(minimo >= 0)) {
      mensaje = "El stock y el mínimo deben ser números de 0 en adelante.";
    } else if (productos.some((p) => p.codigo === codigo)) {
      mensaje = "Ya existe un producto con el código " + codigo + ".";
    }
    if (mensaje) {
      setError(mensaje);
      return;
    }

    if (await agregar({ nombre, codigo, stock, minimo })) dialogo.current.close();
  }

  function borrar(p) {
    if (window.confirm('¿Eliminar "' + p.nombre + '" del inventario?')) eliminar(p.id);
  }

  async function copiarCsv() {
    try {
      await navigator.clipboard.writeText(comoCsv(productos));
      setCsv("¡Copiado!");
    } catch {
      setCsv("No se pudo copiar");
    }
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCsv("Copiar CSV"), 2000);
  }

  return (
    <SeccionDashboard>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h1 className="text-xl font-bold text-(--texto)">Inventario de productos</h1>
        <span className="rounded-full bg-(--viz-verde-fondo) px-3 py-1 text-xs font-semibold text-(--viz-verde-texto)">
          {productos.length + (productos.length === 1 ? " producto" : " productos")}
        </span>
      </div>

      <div className="mt-2 px-4 sm:mt-4 sm:overflow-x-auto sm:px-6">
        <table className="block w-full border-collapse text-left sm:table">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b border-(--borde) text-xs font-semibold uppercase tracking-wider text-(--texto-suave)">
              <th className="py-3 pr-4" scope="col">Producto</th>
              <th className="py-3 pr-4" scope="col">Código</th>
              <th className="py-3 pr-4" scope="col">Stock</th>
              <th className="py-3 pr-4" scope="col">Estado</th>
              <th className="py-3 w-10" scope="col"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {productos.map((p) => (
              <Fila key={p.id} p={p} onStock={cambiarStock} onBorrar={borrar} />
            ))}
          </tbody>
        </table>
        {!cargando && productos.length === 0 && (
          <p className="py-10 text-center text-sm text-(--texto-suave)">
            Todavía no cargaste productos. Tocá <strong>Agregar producto</strong> para empezar.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--borde) px-5 py-4 sm:px-6">
        <button
          className="inline-flex items-center gap-2 rounded-full bg-(--boton) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--boton-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
          type="button"
          onClick={abrirDialogo}
        >
          <i className="fa-solid fa-plus text-xs"></i> Agregar producto
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-full border border-(--borde) px-5 py-2.5 text-sm font-medium text-(--texto) cursor-pointer transition hover:bg-(--fondo) hover:text-(--acento-hover)"
          type="button"
          onClick={copiarCsv}
        >
          <i className="fa-regular fa-copy text-xs"></i> <span>{csv}</span>
        </button>
      </div>

      <dialog
        ref={dialogo}
        className="m-auto w-[min(92vw,24rem)] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      >
        <form className="flex flex-col gap-4 p-6" onSubmit={guardar} noValidate>
          <h2 className="text-lg font-bold">Agregar producto</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="nuevo-nombre">Producto</label>
            <input className={CLASE_INPUT_DIALOGO} id="nuevo-nombre" name="nombre" type="text" maxLength={60} placeholder="Ej: Camiseta básica" value={form.nombre} onChange={cambiarCampo} autoFocus required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="nuevo-codigo">Código</label>
            <input className={CLASE_INPUT_DIALOGO + " uppercase"} id="nuevo-codigo" name="codigo" type="text" maxLength={20} placeholder="Ej: CAM-001" value={form.codigo} onChange={cambiarCampo} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="nuevo-stock">Stock inicial</label>
              <input className={CLASE_INPUT_DIALOGO} id="nuevo-stock" name="stock" type="number" min="0" step="1" value={form.stock} onChange={cambiarCampo} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="nuevo-minimo">Stock mínimo</label>
              <input className={CLASE_INPUT_DIALOGO} id="nuevo-minimo" name="minimo" type="number" min="0" step="1" value={form.minimo} onChange={cambiarCampo} required />
            </div>
          </div>
          {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogo.current.close()}>
              Cancelar
            </button>
            <button className="rounded-full bg-(--boton) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--boton-hover)" type="submit">
              Guardar
            </button>
          </div>
        </form>
      </dialog>
    </SeccionDashboard>
  );
}
