import { useState } from "react";
import { discriminaIva } from "../lib/impuestos.js";

const MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";

/**
 * Diálogo para cargar de una vez el costo de los productos que todavía no lo tienen
 * (sobre todo los que ya tienen stock). Los que se dejan vacíos siguen con costo pendiente: nunca se asume cero.
 * `dialogoRef` lo abre quien lo usa (dialogoRef.current.showModal()).
 */
export default function CargaCostos({ dialogoRef, productos, config, alGuardar }) {
  const [valores, setValores] = useState({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Primero los que tienen stock: son los que más pesan en el costo de lo vendido
  const pendientes = productos
    .filter((p) => p.costoConIva === null)
    .sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.nombre.localeCompare(b.nombre));

  async function guardar(e) {
    e.preventDefault();
    const lista = [];
    for (const p of pendientes) {
      const texto = String(valores[p.id] ?? "").trim().replace(",", ".");
      if (texto === "") continue;
      const n = Number(texto);
      if (!Number.isFinite(n) || n < 0) {
        setError('El costo de "' + p.nombre + '" tiene que ser un importe de 0 en adelante.');
        return;
      }
      lista.push({ id: p.id, costoConIva: n });
    }
    if (lista.length === 0) {
      setError("Escribí el costo de al menos un producto.");
      return;
    }
    setError("");
    setEnviando(true);
    const exito = await alGuardar(lista);
    setEnviando(false);
    if (exito) {
      setValores({});
      dialogoRef.current.close();
    }
  }

  return (
    <dialog
      ref={dialogoRef}
      className="m-auto w-[min(94vw,36rem)] max-h-[92vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      aria-labelledby="titulo-carga-costos"
    >
      <form className="flex max-h-[92vh] flex-col gap-4 p-6" noValidate onSubmit={guardar}>
        <div>
          <h3 id="titulo-carga-costos" className="text-lg font-bold">Cargar costos pendientes</h3>
          <p className="mt-1 text-sm text-(--texto-suave)">
            Escribí cuánto te costó <strong className="text-(--texto)">cada unidad</strong>, con el IVA incluido (lo que pagaste).
            {discriminaIva(config)
              ? " El sistema separa el IVA que podés recuperar."
              : " Con tu condición fiscal, el IVA de las compras forma parte del costo."}{" "}
            Si no sabés el costo de alguno, dejalo vacío: seguirá pendiente y las ganancias que lo usen se mostrarán como incompletas.
          </p>
        </div>

        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {pendientes.length === 0 && (
            <li className="py-6 text-center text-sm text-(--texto-suave)">Todos los productos tienen su costo cargado.</li>
          )}
          {pendientes.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5">
              <label htmlFor={"costo-" + p.id} className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                <span className="block truncate text-xs text-(--texto-suave)">
                  {p.sku} · {p.stock > 0 ? "Stock: " + p.stock : "Sin stock"}
                  {typeof p.precio === "number" ? " · Precio " + MONEDA.format(p.precio) : ""}
                </span>
              </label>
              <input
                id={"costo-" + p.id}
                className={CLASE_INPUT}
                type="text"
                inputMode="decimal"
                placeholder="Costo ($)"
                autoComplete="off"
                value={valores[p.id] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoRef.current.close()}>
            Cerrar
          </button>
          {pendientes.length > 0 && (
            <button className="rounded-full bg-(--acento-hover) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto) disabled:cursor-wait disabled:opacity-60" type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar costos"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
