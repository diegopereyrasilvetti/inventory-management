import { useRef, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { useCompras } from "../../store/compras.js";
import { useProveedores } from "../../store/proveedores.js";
import { MONEDA } from "../../store/finanzas.js";

const FORM_VACIO = { nombre: "", rubro: "", contacto: "", telefono: "", email: "", estado: "activo" };
const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";

function hrefTelefono(telefono) {
  return "tel:" + telefono.replace(/[^\d+]/g, "");
}

function BadgeEstado({ activo }) {
  return (
    <span
      className={
        "inline-block rounded-full px-3 py-1 text-xs font-semibold " +
        (activo ? "bg-(--viz-verde-fondo) text-(--viz-verde-texto)" : "bg-(--viz-gris-fondo) text-(--viz-gris-texto)")
      }
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function ProveedoresDato({ etiqueta, valor, enlace, textoEnlace, icono }) {
  return (
    <div className="rounded-lg border border-(--borde) bg-(--fondo) px-3.5 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-(--texto-suave)">{etiqueta}</dt>
      <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-(--texto)">{valor || "No cargado"}</span>
        {valor && enlace && (
          <a
            className="inline-flex items-center gap-1.5 rounded-full bg-(--acento-hover) px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-(--texto)"
            href={enlace}
          >
            <i className={icono + " text-[10px]"} />
            {textoEnlace}
          </a>
        )}
      </dd>
    </div>
  );
}

export default function Proveedores() {
  const { proveedores, cargando, agregar, actualizar, eliminar } = useProveedores();
  const { deudaPorProveedor } = useCompras(); // lo que se le debe a cada proveedor por compras a pagar
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [idEditado, setIdEditado] = useState(null);
  const [error, setError] = useState("");
  const [verProveedor, setVerProveedor] = useState(null);
  const dialogoRef = useRef(null);
  const dialogoVerRef = useRef(null);
  const nombreRef = useRef(null);

  const activos = proveedores.filter((p) => p.activo).length;
  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? proveedores.filter((p) =>
        [p.nombre, p.rubro, p.contacto, p.telefono, p.email].some((c) => String(c || "").toLowerCase().includes(q)),
      )
    : proveedores;

  function campo(nombre) {
    return (e) => setForm((f) => ({ ...f, [nombre]: e.target.value }));
  }

  function abrirFormulario(p) {
    setError("");
    setIdEditado(p ? p.id : null);
    setForm(
      p
        ? {
            nombre: p.nombre,
            rubro: p.rubro || "",
            contacto: p.contacto || "",
            telefono: p.telefono || "",
            email: p.email || "",
            estado: p.activo ? "activo" : "inactivo",
          }
        : FORM_VACIO,
    );
    dialogoRef.current.showModal();
    nombreRef.current?.focus();
  }

  function abrirDetalle(p) {
    setVerProveedor(p);
    dialogoVerRef.current.showModal();
  }

  // Siempre mostramos los datos más recientes del proveedor que se está viendo
  const detalle = verProveedor ? proveedores.find((p) => p.id === verProveedor.id) || verProveedor : null;

  async function guardar(e) {
    e.preventDefault();
    const datos = {
      nombre: form.nombre.trim(),
      rubro: form.rubro.trim(),
      contacto: form.contacto.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim(),
      activo: form.estado === "activo",
    };

    let mensaje = "";
    if (!datos.nombre) {
      mensaje = "Completá el nombre del proveedor.";
    } else if (datos.telefono && !/^[\d\s+()\-.]{6,25}$/.test(datos.telefono)) {
      mensaje = "El teléfono solo puede tener números, espacios, + ( ) y guiones.";
    } else if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) {
      mensaje = "Revisá el formato del email.";
    } else if (proveedores.some((p) => p.nombre.toLowerCase() === datos.nombre.toLowerCase() && p.id !== idEditado)) {
      mensaje = "Ya existe un proveedor con ese nombre.";
    }
    if (mensaje) {
      setError(mensaje);
      return;
    }

    const exito = idEditado ? await actualizar(idEditado, datos) : await agregar(datos);
    if (exito) dialogoRef.current.close();
  }

  async function borrar() {
    const p = proveedores.find((x) => x.id === idEditado);
    if (p && window.confirm('¿Eliminar a "' + p.nombre + '" de tus proveedores?')) {
      if (await eliminar(p.id)) dialogoRef.current.close();
    }
  }

  function editarDesdeDetalle() {
    dialogoVerRef.current.close();
    if (detalle) abrirFormulario(detalle);
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-proveedores">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="titulo-proveedores" className="text-xl font-bold text-(--texto)">Proveedores</h2>
          <p className="mt-0.5 text-sm text-(--texto-suave)">
            {proveedores.length + (proveedores.length === 1 ? " proveedor registrado" : " proveedores registrados")}
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-(--acento-hover) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--texto) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
          type="button"
          onClick={() => abrirFormulario(null)}
        >
          <i className="fa-solid fa-plus text-xs" /> Nuevo proveedor
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2 px-5 pt-4 sm:gap-4 sm:px-6">
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-2.5 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-regular fa-building text-(--viz-violeta)" aria-hidden="true" /> Total</dt>
          <dd className="mt-1.5 text-2xl font-bold text-(--texto) sm:text-3xl">{proveedores.length}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-2.5 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-regular fa-circle-check text-(--viz-verde)" aria-hidden="true" /> Activos</dt>
          <dd className="mt-1.5 text-2xl font-bold text-(--texto) sm:text-3xl">{activos}</dd>
        </div>
        <div className="rounded-xl border border-(--borde) bg-(--fondo) p-2.5 sm:p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-(--texto-suave) sm:text-sm"><i className="fa-regular fa-circle-pause text-(--viz-gris)" aria-hidden="true" /> Inactivos</dt>
          <dd className="mt-1.5 text-2xl font-bold text-(--texto) sm:text-3xl">{proveedores.length - activos}</dd>
        </div>
      </dl>

      <div className="px-5 pt-4 sm:px-6">
        <form className="relative" role="search" onSubmit={(e) => e.preventDefault()}>
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-(--texto-suave)" />
          <input
            className="w-full rounded-full border border-(--borde) bg-(--fondo) py-3 pl-11 pr-4 text-sm text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
            type="search"
            placeholder="Buscar por nombre, contacto, rubro o teléfono…"
            aria-label="Buscar proveedor"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </form>
      </div>

      <div className="px-5 pb-5 pt-4 sm:px-6">
        <div role="table" aria-label="Proveedores">
          <div className="hidden border-b border-(--borde) pb-3 text-xs font-semibold uppercase tracking-wider text-(--texto-suave) sm:grid sm:grid-cols-[minmax(0,1fr)_13rem_7rem_5.5rem] sm:gap-4" role="row">
            <span role="columnheader">Proveedor</span>
            <span role="columnheader">Contacto</span>
            <span role="columnheader">Estado</span>
            <span className="text-right" role="columnheader">Acciones</span>
          </div>
          <div role="rowgroup">
            {visibles.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-(--borde) py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_13rem_7rem_5.5rem] sm:gap-4"
                role="row"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-(--texto)">{p.nombre}</p>
                  <p className="break-words text-xs text-(--texto-suave)">{p.rubro || "Sin rubro"}</p>
                  {deudaPorProveedor.get(p.id) > 0 && (
                    <p className="text-xs font-semibold text-(--viz-naranja-texto)" data-deuda>{"Deuda: " + MONEDA.format(deudaPorProveedor.get(p.id))}</p>
                  )}
                </div>

                <span className="col-start-2 row-start-1 flex justify-self-end gap-1 sm:col-start-4">
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition hover:bg-(--fondo) hover:text-(--acento-hover) lg:size-8"
                    aria-label={"Ver contacto de " + p.nombre}
                    onClick={() => abrirDetalle(p)}
                  >
                    <i className="fa-regular fa-eye text-sm" />
                  </button>
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-full text-(--texto-suave) cursor-pointer transition hover:bg-(--fondo) hover:text-(--acento-hover) lg:size-8"
                    aria-label={"Editar " + p.nombre}
                    onClick={() => abrirFormulario(p)}
                  >
                    <i className="fa-regular fa-pen-to-square text-sm" />
                  </button>
                </span>

                <div className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1">
                  <p className="break-words text-sm text-(--texto)">{p.contacto || "—"}</p>
                  {p.telefono ? (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-(--acento-hover) hover:underline"
                      href={hrefTelefono(p.telefono)}
                      aria-label={"Llamar a " + p.nombre + " al " + p.telefono}
                    >
                      <i className="fa-solid fa-phone text-[10px]" />
                      {p.telefono}
                    </a>
                  ) : (
                    <p className="text-xs text-(--texto-suave)">Sin teléfono</p>
                  )}
                </div>

                <span className="col-start-2 row-start-2 justify-self-end sm:col-start-3 sm:row-start-1 sm:justify-self-start">
                  <BadgeEstado activo={p.activo} />
                </span>
              </div>
            ))}
          </div>
        </div>
        {!cargando && visibles.length === 0 && (
          <p className="py-8 text-center text-sm text-(--texto-suave)">
            {proveedores.length === 0
              ? 'Todavía no cargaste proveedores. Tocá "Nuevo proveedor" para empezar.'
              : "No hay proveedores que coincidan con la búsqueda."}
          </p>
        )}
      </div>

      {/* Crear / editar */}
      <dialog
        ref={dialogoRef}
        className="m-auto w-[min(94vw,30rem)] max-h-[92vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      >
        <form className="flex flex-col gap-4 p-6" noValidate onSubmit={guardar}>
          <h3 className="text-lg font-bold">{idEditado ? "Editar proveedor" : "Nuevo proveedor"}</h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="prv-nombre">Nombre *</label>
            <input ref={nombreRef} className={CLASE_INPUT} id="prv-nombre" type="text" maxLength={60} placeholder="Ej: Distribuidora Central" required value={form.nombre} onChange={campo("nombre")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prv-rubro">Rubro</label>
              <input className={CLASE_INPUT} id="prv-rubro" type="text" maxLength={40} placeholder="Ej: Mercadería general" value={form.rubro} onChange={campo("rubro")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prv-contacto">Persona de contacto</label>
              <input className={CLASE_INPUT} id="prv-contacto" type="text" maxLength={60} placeholder="Ej: Carlos Gómez" autoComplete="off" value={form.contacto} onChange={campo("contacto")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prv-telefono">Teléfono</label>
              <input className={CLASE_INPUT} id="prv-telefono" type="tel" maxLength={25} placeholder="Ej: +54 11 5555-0101" autoComplete="off" value={form.telefono} onChange={campo("telefono")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="prv-email">Email</label>
              <input className={CLASE_INPUT} id="prv-email" type="email" maxLength={80} placeholder="ventas@proveedor.com" autoComplete="off" value={form.email} onChange={campo("email")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="prv-estado">Estado</label>
            <select
              id="prv-estado"
              className="w-full cursor-pointer rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
              value={form.estado}
              onChange={campo("estado")}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>

          {error && <p className="text-sm text-(--stock-agotado)" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {idEditado && (
              <button
                className="rounded-full px-4 py-2 text-sm font-medium text-(--stock-agotado) cursor-pointer hover:bg-(--stock-agotado)/10"
                type="button"
                onClick={borrar}
              >
                Eliminar
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoRef.current.close()}>Cancelar</button>
              <button className="rounded-full bg-(--acento-hover) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto)" type="submit">Guardar</button>
            </div>
          </div>
        </form>
      </dialog>

      {/* Ver contacto */}
      <dialog
        ref={dialogoVerRef}
        className="m-auto w-[min(94vw,26rem)] max-h-[92vh] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold">{detalle?.nombre}</h3>
              <p className="text-sm text-(--texto-suave)">{detalle ? detalle.rubro || "Sin rubro" : ""}</p>
            </div>
            <span>{detalle && <BadgeEstado activo={detalle.activo} />}</span>
          </div>
          <dl className="flex flex-col gap-3">
            {detalle && (
              <>
                <ProveedoresDato etiqueta="Persona de contacto" valor={detalle.contacto} />
                <ProveedoresDato
                  etiqueta="Teléfono"
                  valor={detalle.telefono}
                  enlace={detalle.telefono ? hrefTelefono(detalle.telefono) : ""}
                  textoEnlace="Llamar"
                  icono="fa-solid fa-phone"
                />
                <ProveedoresDato
                  etiqueta="Email"
                  valor={detalle.email}
                  enlace={detalle.email ? "mailto:" + detalle.email : ""}
                  textoEnlace="Escribir"
                  icono="fa-regular fa-envelope"
                />
              </>
            )}
          </dl>
          <div className="flex justify-end gap-2 pt-1">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoVerRef.current.close()}>Cerrar</button>
            <button className="rounded-full bg-(--acento-hover) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto)" type="button" onClick={editarDesdeDetalle}>Editar</button>
          </div>
        </div>
      </dialog>
    </SeccionDashboard>
  );
}
