import { Link } from "react-router-dom";

const CLASE_ENLACE =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-(--texto) hover:bg-(--fondo) hover:text-(--acento-hover)";

/**
 * Botón con el nombre de la persona y su menú de opciones (Mi perfil, Cerrar sesión...).
 * variante="centro"  -> celular y tablet: va en el centro del encabezado, con el nombre siempre visible.
 * variante="derecha" -> pantallas grandes: va a la derecha, junto a la campana.
 * El panel renderiza las dos y el CSS muestra solo la que corresponde al tamaño de pantalla.
 */
export default function MenuUsuario({ variante, abierto, alAlternar, nombre, rolTexto, esAdmin, email, alSalir }) {
  const centro = variante === "centro";
  const idMenu = "menu-usuario-" + variante;

  return (
    <div className="relative" data-menu-usuario>
      <button
        className="flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-2.5 cursor-pointer transition hover:bg-(--fondo)"
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={alAlternar}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--acento-hover) text-xs font-semibold text-white"
          aria-hidden="true"
        >
          {nombre.charAt(0).toUpperCase() || "U"}
        </span>
        <span className={"min-w-0 text-left leading-tight " + (centro ? "" : "hidden md:block")}>
          <span
            className="block max-w-[6.5rem] truncate text-sm font-semibold text-(--texto) min-[400px]:max-w-32 sm:max-w-40"
            title={nombre}
          >
            {nombre}
          </span>
          {/* En celular solo el nombre; el rol aparece desde tablet */}
          <span
            className={(centro ? "hidden md:block" : "block") + " max-w-40 truncate text-xs text-(--texto-suave)"}
            title={email}
          >
            {rolTexto}
          </span>
        </span>
        <span className={centro ? "hidden md:block" : "hidden md:block"}>
          <i className="fa-solid fa-chevron-down text-xs text-(--texto-suave)"></i>
        </span>
      </button>

      {abierto && (
        <ul
          id={idMenu}
          className={
            "absolute top-full mt-2 w-56 bg-(--superficie) border border-(--borde) rounded-xl shadow-[0_8px_24px_rgba(59,42,32,0.12)] p-2 " +
            (centro ? "left-1/2 -translate-x-1/2" : "right-0")
          }
          role="menu"
        >
          <li role="none">
            <Link className={CLASE_ENLACE} to="/dashboard/perfil" role="menuitem">
              <i className="fa-solid fa-user w-4 text-center"></i> Mi perfil
            </Link>
          </li>
          {/* Solo los administradores ven esta opción */}
          {esAdmin && (
            <li role="none">
              <Link className={CLASE_ENLACE} to="/dashboard/usuarios" role="menuitem">
                <i className="fa-solid fa-users w-4 text-center"></i> Personas
              </Link>
            </li>
          )}
          <li role="none">
            <a className={CLASE_ENLACE} href="#reportes" role="menuitem">
              <i className="fa-solid fa-file-lines w-4 text-center"></i> Reportes
            </a>
          </li>
          <li role="none">
            <Link className={CLASE_ENLACE} to="/dashboard/configuracion" role="menuitem">
              <i className="fa-solid fa-gear w-4 text-center"></i> Configuración
            </Link>
          </li>
          <li role="none" className="mt-1 border-t border-(--borde) pt-1">
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-(--stock-agotado) hover:bg-(--fondo) cursor-pointer"
              type="button"
              role="menuitem"
              onClick={alSalir}
            >
              <i className="fa-solid fa-right-from-bracket w-4 text-center"></i> Cerrar sesión
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
