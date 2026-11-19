import { Link } from "react-router-dom";
import ToggleTema from "./ToggleTema.jsx";
import { LOGO, Marca } from "./Logo.jsx";

/** Marco común de las pantallas de acceso (login, registro, recuperar contraseña): encabezado, tarjeta y pie. */
export default function LayoutAcceso({ titulo, subtitulo, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-(--superficie) border-b border-(--borde)">
        <nav className="flex justify-between items-center px-4 py-3 sm:px-6 sm:py-4 lg:px-10">
          <Link className="flex items-center gap-2.5" to="/" aria-label="Volver al inicio">
            <img className="block h-9 sm:h-11 w-auto" src={LOGO} alt="Logo de Gestión De Stock" />
            <Marca className="text-2xl sm:text-3xl font-extrabold tracking-[0.02em] text-(--texto)" />
          </Link>
          <div className="flex items-center gap-2">
          <ToggleTema />
          <Link
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-(--borde) text-(--texto) transition hover:bg-(--fondo) hover:text-(--acento-hover)"
            to="/"
          >
            <i className="fa-solid fa-arrow-left text-xs"></i> Volver al inicio
          </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-sm bg-(--superficie) border border-(--borde) rounded-xl p-6 sm:p-8 shadow-[0_8px_24px_rgba(59,42,32,0.06)]">
          <h1 className="text-2xl font-bold text-(--texto) text-center">{titulo}</h1>
          <p className="mt-1 text-sm text-(--texto-suave) text-center">{subtitulo}</p>
          {children}
        </section>
      </main>

      <footer className="bg-(--pie) text-(--pie-texto)/70">
        <p className="px-4 py-4 text-xs text-center">© 2026 Gestión de Stock. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

export const CLASE_INPUT_ACCESO =
  "w-full px-3.5 py-2.5 text-sm rounded-lg bg-(--fondo) border border-(--borde) text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";

export const CLASE_BOTON_ACCESO =
  "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-(--boton) text-white font-semibold cursor-pointer transition hover:bg-(--boton-hover) disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)";
