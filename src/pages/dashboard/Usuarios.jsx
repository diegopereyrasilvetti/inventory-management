import { useRef, useState } from "react";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import useAviso from "../../hooks/useAviso.js";
import useTitulo from "../../hooks/useTitulo.js";
import { useUsuarios } from "../../store/usuarios.js";

const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30 disabled:opacity-60";
const CLASE_DIALOGO =
  "m-auto w-[min(92vw,26rem)] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50";
const CLASE_BOTON_ICONO =
  "flex size-9 items-center justify-center rounded-full border border-(--borde) text-(--texto) cursor-pointer transition hover:bg-(--fondo) hover:text-(--acento-hover)";

const FORM_CREAR = { nombre: "", email: "", password: "", rol: "usuario" };

// Contraseña al azar de 12 caracteres, sin letras que se confunden entre sí (0/O, 1/l/I)
function generarPassword() {
  const letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const numeros = new Uint32Array(12);
  crypto.getRandomValues(numeros);
  return Array.from(numeros, (n) => letras[n % letras.length]).join("");
}

function Insignia({ ok, textoOk, textoNo }) {
  return (
    <span
      className={
        "inline-block rounded-full px-3 py-1 text-xs font-semibold " +
        (ok ? "bg-(--viz-verde-fondo) text-(--viz-verde-texto)" : "bg-(--viz-gris-fondo) text-(--viz-gris-texto)")
      }
    >
      {ok ? textoOk : textoNo}
    </span>
  );
}

function Campo({ id, etiqueta, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>{etiqueta}</label>
      {children}
    </div>
  );
}

/** Administración de personas: crear cuentas, cambiar nombre y rol, desactivar, poner contraseña, eliminar. */
export default function Usuarios() {
  useTitulo("Personas | Gestión de Stock");
  const { user } = useAuth();
  const { usuarios, cargando, error, crear, editar, cambiarPassword, eliminar } = useUsuarios();
  const [aviso, avisar] = useAviso();

  const dialogoCrear = useRef(null);
  const dialogoEditar = useRef(null);
  const dialogoPassword = useRef(null);
  const [formCrear, setFormCrear] = useState(FORM_CREAR);
  const [errorCrear, setErrorCrear] = useState("");
  const [formEditar, setFormEditar] = useState({ id: "", nombre: "", rol: "usuario", activo: true });
  const [errorEditar, setErrorEditar] = useState("");
  const [formPassword, setFormPassword] = useState({ id: "", nombre: "", password: "" });
  const [errorPassword, setErrorPassword] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const campoCrear = (n) => (e) => setFormCrear((f) => ({ ...f, [n]: e.target.value }));

  function abrirCrear() {
    setFormCrear({ ...FORM_CREAR, password: generarPassword() });
    setErrorCrear("");
    dialogoCrear.current.showModal();
  }

  async function guardarCrear(e) {
    e.preventDefault();
    const datos = { nombre: formCrear.nombre.trim(), email: formCrear.email.trim().toLowerCase(), password: formCrear.password, rol: formCrear.rol };
    if (!datos.nombre) return setErrorCrear("Escribí el nombre de la persona.");
    if (!/^\S+@\S+\.\S+$/.test(datos.email)) return setErrorCrear("Escribí un email válido.");
    if (datos.password.length < 6) return setErrorCrear("La contraseña debe tener al menos 6 caracteres.");

    setTrabajando(true);
    const exito = await crear(datos);
    setTrabajando(false);
    if (!exito) return; // el cartel rojo ya explica el motivo (por ejemplo, email repetido)
    dialogoCrear.current.close();
    avisar("Cuenta creada para " + datos.email + ". Pasale la contraseña: después puede cambiarla en Mi perfil.", true);
  }

  function abrirEditar(p) {
    setFormEditar({ id: p.id, nombre: p.nombre || "", rol: p.rol, activo: p.activo });
    setErrorEditar("");
    dialogoEditar.current.showModal();
  }

  async function guardarEditar(e) {
    e.preventDefault();
    const nombre = formEditar.nombre.trim();
    if (!nombre) return setErrorEditar("El nombre no puede quedar vacío.");
    const cambios = { nombre, rol: formEditar.rol, activo: formEditar.activo };

    setTrabajando(true);
    const exito = await editar(formEditar.id, cambios);
    setTrabajando(false);
    if (!exito) return;
    dialogoEditar.current.close();
    avisar("Cambios guardados.", true);
  }

  function abrirPassword(p) {
    setFormPassword({ id: p.id, nombre: p.nombre || p.email, password: generarPassword() });
    setErrorPassword("");
    dialogoPassword.current.showModal();
  }

  async function guardarPassword(e) {
    e.preventDefault();
    if (formPassword.password.length < 6) return setErrorPassword("La contraseña debe tener al menos 6 caracteres.");
    setTrabajando(true);
    const exito = await cambiarPassword(formPassword.id, formPassword.password);
    setTrabajando(false);
    if (!exito) return;
    dialogoPassword.current.close();
    avisar("Contraseña cambiada para " + formPassword.nombre + ". Pasásela a la persona.", true);
  }

  async function borrar(p) {
    const mensaje =
      "¿Eliminar la cuenta de " + (p.nombre || p.email) + "?\n\n" +
      "Ya no podrá entrar. Lo que cargó (productos, ventas, gastos) se conserva. " +
      "Si solo querés que no entre por ahora, conviene desactivarla en vez de eliminarla.";
    if (!window.confirm(mensaje)) return;
    if (await eliminar(p.id)) avisar("Cuenta eliminada.", true);
  }

  return (
    <SeccionDashboard aria-labelledby="titulo-personas">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h1 id="titulo-personas" className="text-xl font-bold text-(--texto)">Personas</h1>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Quiénes pueden entrar al panel y con qué rol.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-(--boton) px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--boton-hover)"
          type="button"
          onClick={abrirCrear}
        >
          <i className="fa-solid fa-user-plus text-xs"></i> Nueva persona
        </button>
      </div>

      {aviso && (
        <p
          className="mx-5 mt-4 rounded-lg border border-(--viz-verde)/40 bg-(--viz-verde-fondo) px-4 py-2.5 text-sm text-(--viz-verde-texto) sm:mx-6"
          role="status"
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-4 px-4 pb-5 sm:px-6">
        {error && (
          <p className="rounded-lg border border-(--stock-agotado)/40 px-4 py-3 text-sm text-(--stock-agotado)" role="alert">
            {error.mensajeUsuario || "No se pudo cargar la lista de personas."}
          </p>
        )}
        {cargando && !error && <p className="py-8 text-center text-sm text-(--texto-suave)">Cargando…</p>}
        <ul className="divide-y divide-(--borde)">
          {usuarios.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--boton) text-sm font-semibold text-white"
                aria-hidden="true"
              >
                {(p.nombre || p.email || "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-semibold text-(--texto)">
                  {p.nombre || "Sin nombre"}
                  {p.id === user?.id && <span className="ml-2 text-xs font-normal text-(--texto-suave)">(vos)</span>}
                </p>
                <p className="truncate text-xs text-(--texto-suave)">{p.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Insignia ok={p.rol === "admin"} textoOk="Administrador" textoNo="Usuario" />
                <Insignia ok={p.activo} textoOk="Activa" textoNo="Desactivada" />
              </div>
              <div className="flex items-center gap-1.5">
                <button className={CLASE_BOTON_ICONO} type="button" aria-label={"Editar a " + (p.nombre || p.email)} title="Editar" onClick={() => abrirEditar(p)}>
                  <i className="fa-solid fa-pen text-xs"></i>
                </button>
                <button className={CLASE_BOTON_ICONO} type="button" aria-label={"Cambiar la contraseña de " + (p.nombre || p.email)} title="Cambiar contraseña" onClick={() => abrirPassword(p)}>
                  <i className="fa-solid fa-key text-xs"></i>
                </button>
                {p.id !== user?.id && (
                  <button
                    className={CLASE_BOTON_ICONO + " hover:border-(--stock-agotado)/40 hover:text-(--stock-agotado)"}
                    type="button"
                    aria-label={"Eliminar la cuenta de " + (p.nombre || p.email)}
                    title="Eliminar"
                    onClick={() => borrar(p)}
                  >
                    <i className="fa-regular fa-trash-can text-xs"></i>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ---------- Nueva persona ---------- */}
      <dialog ref={dialogoCrear} className={CLASE_DIALOGO}>
        <form className="flex flex-col gap-4 p-6" onSubmit={guardarCrear} noValidate>
          <h2 className="text-lg font-bold">Nueva persona</h2>
          <Campo id="per-nombre" etiqueta="Nombre">
            <input className={CLASE_INPUT} id="per-nombre" type="text" maxLength={60} placeholder="Ej: Ana López" value={formCrear.nombre} onChange={campoCrear("nombre")} autoFocus />
          </Campo>
          <Campo id="per-email" etiqueta="Email">
            <input className={CLASE_INPUT} id="per-email" type="email" maxLength={120} placeholder="ana@empresa.com" autoComplete="off" value={formCrear.email} onChange={campoCrear("email")} />
          </Campo>
          <Campo id="per-password" etiqueta="Contraseña inicial">
            <div className="flex gap-2">
              <input className={CLASE_INPUT + " font-mono"} id="per-password" type="text" autoComplete="off" value={formCrear.password} onChange={campoCrear("password")} />
              <button className="shrink-0 rounded-lg border border-(--borde) px-3 text-xs font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => setFormCrear((f) => ({ ...f, password: generarPassword() }))}>
                Generar
              </button>
            </div>
          </Campo>
          <Campo id="per-rol" etiqueta="Rol">
            <select className={CLASE_INPUT} id="per-rol" value={formCrear.rol} onChange={campoCrear("rol")}>
              <option value="usuario">Usuario (usa el panel)</option>
              <option value="admin">Administrador (además gestiona personas)</option>
            </select>
          </Campo>
          {errorCrear && <p className="text-sm text-(--stock-agotado)" role="alert">{errorCrear}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoCrear.current.close()}>Cancelar</button>
            <button className="rounded-full bg-(--boton) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--boton-hover) disabled:opacity-60" type="submit" disabled={trabajando}>
              {trabajando ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ---------- Editar ---------- */}
      <dialog ref={dialogoEditar} className={CLASE_DIALOGO}>
        <form className="flex flex-col gap-4 p-6" onSubmit={guardarEditar} noValidate>
          <h2 className="text-lg font-bold">Editar persona</h2>
          <Campo id="edi-nombre" etiqueta="Nombre">
            <input className={CLASE_INPUT} id="edi-nombre" type="text" maxLength={60} value={formEditar.nombre} onChange={(e) => setFormEditar((f) => ({ ...f, nombre: e.target.value }))} />
          </Campo>
          <Campo id="edi-rol" etiqueta="Rol">
            <select className={CLASE_INPUT} id="edi-rol" value={formEditar.rol} disabled={formEditar.id === user?.id} onChange={(e) => setFormEditar((f) => ({ ...f, rol: e.target.value }))}>
              <option value="usuario">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input className="size-4 accent-(--acento-hover)" type="checkbox" checked={formEditar.activo} disabled={formEditar.id === user?.id} onChange={(e) => setFormEditar((f) => ({ ...f, activo: e.target.checked }))} />
            Cuenta activa (si la desactivás, no puede entrar)
          </label>
          {formEditar.id === user?.id && (
            <p className="text-xs text-(--texto-suave)">No podés cambiarte el rol ni desactivarte a vos mismo.</p>
          )}
          {errorEditar && <p className="text-sm text-(--stock-agotado)" role="alert">{errorEditar}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoEditar.current.close()}>Cancelar</button>
            <button className="rounded-full bg-(--boton) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--boton-hover) disabled:opacity-60" type="submit" disabled={trabajando}>
              {trabajando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ---------- Contraseña ---------- */}
      <dialog ref={dialogoPassword} className={CLASE_DIALOGO}>
        <form className="flex flex-col gap-4 p-6" onSubmit={guardarPassword} noValidate>
          <h2 className="text-lg font-bold">Contraseña de {formPassword.nombre}</h2>
          <p className="text-sm text-(--texto-suave)">Se reemplaza la contraseña actual. Pasásela a la persona; después puede cambiarla en Mi perfil.</p>
          <Campo id="pas-password" etiqueta="Contraseña nueva">
            <div className="flex gap-2">
              <input className={CLASE_INPUT + " font-mono"} id="pas-password" type="text" autoComplete="off" value={formPassword.password} onChange={(e) => setFormPassword((f) => ({ ...f, password: e.target.value }))} />
              <button className="shrink-0 rounded-lg border border-(--borde) px-3 text-xs font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => setFormPassword((f) => ({ ...f, password: generarPassword() }))}>
                Generar
              </button>
            </div>
          </Campo>
          {errorPassword && <p className="text-sm text-(--stock-agotado)" role="alert">{errorPassword}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-(--borde) px-5 py-2 text-sm font-medium cursor-pointer hover:bg-(--fondo)" type="button" onClick={() => dialogoPassword.current.close()}>Cancelar</button>
            <button className="rounded-full bg-(--boton) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--boton-hover) disabled:opacity-60" type="submit" disabled={trabajando}>
              {trabajando ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </div>
        </form>
      </dialog>
    </SeccionDashboard>
  );
}
