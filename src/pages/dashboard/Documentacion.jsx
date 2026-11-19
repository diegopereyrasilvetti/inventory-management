import { useEffect, useRef, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";

const DOCUMENTOS = [
  { archivo: "Factura_compra_001.pdf", detalle: "12/10/2026 · 245 KB", tipo: "Factura", estado: "Pendiente", pendiente: true },
  { archivo: "Remito_008.pdf", detalle: "11/10/2026 · 180 KB", tipo: "Remito", estado: "Procesado", pendiente: false },
  { archivo: "Nota_credito_003.pdf", detalle: "10/10/2026 · 124 KB", tipo: "Nota de crédito", estado: "Procesado", pendiente: false },
];

export default function Documentacion() {
  const [aviso, setAviso] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function mostrarAviso() {
    setAviso(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(false), 3500);
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-documentacion">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="titulo-documentacion" className="text-xl font-bold text-(--texto)">Documentación</h2>
            <span className="rounded-full bg-(--viz-naranja-fondo) px-2.5 py-0.5 text-xs font-semibold text-(--viz-naranja-texto)">Vista previa</span>
          </div>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Documentos y comprobantes</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-(--boton) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--boton-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
          type="button"
          onClick={mostrarAviso}
        >
          <i className="fa-solid fa-arrow-up-from-bracket text-xs" /> Subir archivo
        </button>
      </div>

      {aviso && (
        <p className="mx-5 mt-4 rounded-lg border border-(--viz-naranja)/40 bg-(--viz-naranja-fondo) px-4 py-2.5 text-sm text-(--viz-naranja-texto) sm:mx-6" role="status">
          Esta función todavía no está disponible. Estamos trabajando en ella.
        </p>
      )}

      <div className="px-5 pt-4 sm:px-6">
        <div className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-(--acento)/40 bg-(--fondo) px-4 py-8 text-center">
          <i className="fa-solid fa-cloud-arrow-up text-3xl text-(--acento)" aria-hidden="true" />
          <h3 className="mt-2 text-base font-semibold text-(--texto)">Cargá tus facturas y remitos</h3>
          <p className="text-sm text-(--texto-suave)">PDF, JPG, PNG o archivos Excel</p>
          <button
            className="mt-3 inline-flex items-center rounded-full border border-(--borde) bg-(--superficie) px-5 py-2 text-sm font-medium text-(--texto) cursor-pointer transition hover:text-(--acento-hover) hover:border-(--acento)"
            type="button"
            onClick={mostrarAviso}
          >
            Preparar carga
          </button>
        </div>
      </div>

      <div className="px-5 pb-5 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-(--texto)">Documentos recientes</h3>
          <div className="relative">
            <label className="sr-only" htmlFor="mov-filtro">Filtrar documentos</label>
            <select
              id="mov-filtro"
              className="cursor-pointer appearance-none rounded-lg border border-(--borde) bg-(--superficie) py-2 pl-3 pr-9 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              value="Todos"
              onChange={mostrarAviso}
            >
              <option>Todos</option>
              <option>Facturas</option>
              <option>Remitos</option>
              <option>Notas de crédito</option>
            </select>
            <i className="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)" />
          </div>
        </div>

        <div className="mt-4" role="table" aria-label="Documentos recientes">
          <div className="hidden border-b border-(--borde) pb-3 text-xs font-semibold uppercase tracking-wider text-(--texto-suave) sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_8rem] sm:gap-4" role="row">
            <span role="columnheader">Archivo</span>
            <span role="columnheader">Tipo</span>
            <span role="columnheader">Estado</span>
          </div>

          {DOCUMENTOS.map((d, i) => (
            <div
              key={d.archivo}
              className={
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1fr)_9rem_8rem] sm:gap-4" +
                (i < DOCUMENTOS.length - 1 ? " border-b border-(--borde)" : "")
              }
              role="row"
            >
              <div className="flex items-center gap-3" role="cell">
                <i className="fa-regular fa-file-lines text-lg text-(--texto-suave)" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-(--texto)">{d.archivo}</p>
                  <p className="text-xs text-(--texto-suave)">{d.detalle}</p>
                </div>
              </div>
              <span className="col-start-2 row-start-1 justify-self-end sm:col-start-3 sm:justify-self-start" role="cell">
                <span
                  className={
                    "inline-block rounded-full px-3 py-1 text-xs font-semibold " +
                    (d.pendiente
                      ? "bg-(--viz-naranja-fondo) text-(--viz-naranja-texto)"
                      : "bg-(--viz-verde-fondo) text-(--viz-verde-texto)")
                  }
                >
                  {d.estado}
                </span>
              </span>
              <span className="col-start-1 pl-8 text-sm text-(--texto-suave) sm:col-start-2 sm:row-start-1 sm:pl-0 sm:text-(--texto)" role="cell">{d.tipo}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-(--texto-suave)">Los documentos de esta lista son un ejemplo. Todavía no se pueden subir archivos.</p>
      </div>
    </SeccionDashboard>
  );
}
