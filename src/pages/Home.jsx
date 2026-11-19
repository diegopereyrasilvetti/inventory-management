import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LOGO, Marca } from "../components/Logo.jsx";
import ToggleTema from "../components/ToggleTema.jsx";
import useTitulo from "../hooks/useTitulo.js";

const CLASE_INPUT =
  "w-full px-4 py-3 text-sm rounded-lg sm:text-base bg-(--fondo) border border-(--borde) text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";
const CLASE_ENLACE_MENU =
  "block px-4 py-3 rounded-lg text-(--texto) hover:bg-(--fondo) hover:text-(--acento-hover)";
const CLASE_SOCIAL =
  "flex size-8 text-sm items-center justify-center rounded-full border border-(--pie-texto)/25 text-(--pie-texto) transition hover:bg-(--acento) hover:border-(--acento) hover:text-white hover:-translate-y-0.5";
const CLASE_LEGAL = "text-(--pie-texto)/80 hover:text-white transition-colors";
const CLASE_PARRAFO =
  "max-w-2xl mx-auto text-base sm:text-[1.05rem] lg:text-lg leading-[1.8] text-(--texto-suave) text-center text-balance";

const IMAGEN_PANEL = {
  src: "/images/Panel de inventario minimalista con gráficos.png",
  alt: "Vista previa del panel de inventario con gráficos de stock",
};
const IMAGEN_INVENTARIO = {
  src: "/images/inventario.png",
  alt: "Listado de productos con código y cantidad disponible",
};

function ImagenAmpliable({ datos, onAmpliar }) {
  return (
    <img
      className="w-full h-auto mt-8 lg:mt-12 rounded-xl border border-(--borde) lg:cursor-zoom-in"
      src={datos.src}
      alt={datos.alt}
      onClick={() => onAmpliar(datos)}
    />
  );
}

export default function Home() {
  useTitulo("Gestion De Stock");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [zoom, setZoom] = useState({ src: "", alt: "" });
  const lightbox = useRef(null);

  function ampliar(datos) {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    setZoom(datos);
    lightbox.current.showModal();
  }

  return (
    <>
      <header id="inicio" className="relative bg-(--superficie) border-b border-(--borde)">
        <nav className="flex justify-between items-center px-4 py-3 sm:px-6 sm:py-4 lg:px-10">
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5">
            <img className="block h-12 sm:h-16 lg:h-[4.5rem] w-auto" src={LOGO} alt="Logo de Gestión De Stock" />
            <h1 className="text-2xl sm:text-5xl lg:text-6xl font-extrabold tracking-[0.02em] text-(--texto)">
              <Marca />
            </h1>
          </div>
          <ToggleTema className="ml-auto" />
          <button
            className="ml-1 text-2xl text-(--texto) cursor-pointer px-2 py-1 rounded-lg hover:bg-(--fondo)"
            type="button"
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            <i className="fa-solid fa-bars"></i>
          </button>
          {menuAbierto && (
            <ul className="absolute top-full right-4 sm:right-6 lg:right-10 w-44 sm:w-48 bg-(--superficie) border border-(--borde) rounded-xl shadow-[0_8px_24px_rgba(59,42,32,0.12)] p-2 z-10">
              <li><Link className={CLASE_ENLACE_MENU} to="/login">Iniciar Sesión</Link></li>
              <li><a className={CLASE_ENLACE_MENU} href="#nosotros" onClick={() => setMenuAbierto(false)}>Nosotros</a></li>
            </ul>
          )}
        </nav>
      </header>

      <main className="max-w-2xl md:max-w-3xl lg:max-w-5xl mx-auto px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        <h2 className="mb-4 sm:mb-5 text-[clamp(1rem,4.4vw,1.75rem)] font-bold leading-tight tracking-tight text-(--texto) text-center whitespace-nowrap">
          Controlá tu stock sin complicaciones
        </h2>
        <p className={CLASE_PARRAFO}>
          Mantené tu inventario siempre organizado y actualizado. Registrá, agregá, editá, eliminá y buscá productos fácilmente, controlá el stock disponible y recibí alertas cuando las existencias sean bajas. ¡Optimizá la gestión de tu emprendimiento en un solo lugar!
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-(--boton) text-white text-base sm:text-lg font-semibold shadow-[0_8px_20px_rgba(143,95,53,0.3)] transition hover:bg-(--boton-hover) hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
            to="/login"
          >
            Empezá a gestionar tu stock <i className="fa-solid fa-arrow-right text-sm"></i>
          </Link>
        </div>
        <ImagenAmpliable datos={IMAGEN_PANEL} onAmpliar={ampliar} />
        <p className={CLASE_PARRAFO + " mt-8 lg:mt-12"}>
          Organizá tus productos de forma simple y rápida. Agregá artículos a tu inventario, identificá cada uno con su código y cantidad disponible, y visualizá fácilmente cuáles aumentan o disminuyen sus ventas mediante indicadores claros y gráficos intuitivos.
        </p>
        <ImagenAmpliable datos={IMAGEN_INVENTARIO} onAmpliar={ampliar} />
      </main>

      <section id="contacto" className="max-w-2xl md:max-w-3xl lg:max-w-5xl mx-auto px-4 pb-10 sm:px-6 sm:pb-14 lg:pb-16">
        <div className="bg-(--superficie) border border-(--borde) rounded-2xl p-5 sm:p-8 shadow-[0_8px_24px_rgba(59,42,32,0.06)]">
          <h2 className="text-xl font-bold text-(--texto) text-center sm:text-2xl">Contactanos</h2>
          <p className="mt-2 text-sm text-(--texto-suave) text-center sm:text-base">
            ¿Tenés dudas o querés más información? Escribinos y te respondemos a la brevedad.
          </p>

          <form className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2" action="mailto:contacto@ejemplo.com" method="post" encType="text/plain">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-(--texto)" htmlFor="nombre">Nombre</label>
              <input className={CLASE_INPUT} type="text" id="nombre" name="nombre" placeholder="Tu nombre" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-(--texto)" htmlFor="email">Email</label>
              <input className={CLASE_INPUT} type="email" id="email" name="email" placeholder="tu@email.com" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-medium text-(--texto)" htmlFor="mensaje">Mensaje</label>
              <textarea className={CLASE_INPUT + " resize-y"} id="mensaje" name="mensaje" rows={5} placeholder="Contanos en qué te podemos ayudar" required></textarea>
            </div>
            <button
              className="mt-2 inline-flex items-center justify-center gap-2 px-7 py-3 text-sm rounded-full md:col-span-2 md:justify-self-center md:px-14 sm:text-base bg-(--boton) text-white font-semibold cursor-pointer transition hover:bg-(--boton-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
              type="submit"
            >
              Enviar mensaje <i className="fa-solid fa-paper-plane text-sm"></i>
            </button>
          </form>
        </div>
      </section>

      <footer className="bg-(--pie) text-(--pie-texto)">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-5 grid gap-6 text-center md:grid-cols-3 md:text-left">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <a className="flex items-center gap-2.5" href="#inicio" aria-label="Gestión de Stock">
              <img className="block h-7 w-auto" src={LOGO} alt="" />
              <Marca azul="text-[#4d9bff]" className="text-lg font-semibold tracking-[0.02em] text-white" />
            </a>
            <p className="text-sm leading-relaxed text-(--pie-texto)/70 max-w-xs">
              Organizá el stock de tu emprendimiento de forma simple y rápida.
            </p>
          </div>

          <nav aria-label="Información legal">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-(--acento) mb-2.5">Legal</h2>
            <ul className="flex flex-col gap-1 text-sm">
              <li><a className={CLASE_LEGAL} href="#politica-de-privacidad">Política de privacidad</a></li>
              <li><a className={CLASE_LEGAL} href="#terminos-y-condiciones">Términos y condiciones</a></li>
              <li><a className={CLASE_LEGAL} href="#politica-de-cookies">Política de cookies</a></li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-(--acento) mb-2.5">Contacto</h2>
            <ul className="flex items-center justify-center gap-3 md:justify-start">
              <li><a className={CLASE_SOCIAL} href="mailto:contacto@ejemplo.com" aria-label="Enviar un mail"><i className="fa-solid fa-envelope"></i></a></li>
              <li><a className={CLASE_SOCIAL} href="#" aria-label="Instagram"><i className="fa-brands fa-instagram"></i></a></li>
              <li><a className={CLASE_SOCIAL} href="#" aria-label="Facebook"><i className="fa-brands fa-facebook-f"></i></a></li>
              <li><a className={CLASE_SOCIAL} href="#" aria-label="X (Twitter)"><i className="fa-brands fa-x-twitter"></i></a></li>
              <li><a className={CLASE_SOCIAL} href="#" aria-label="WhatsApp"><i className="fa-brands fa-whatsapp"></i></a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-(--pie-texto)/15">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-(--pie-texto)/70 text-center">© 2026 Gestión de Stock. Todos los derechos reservados.</p>
            <a className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-(--pie-texto)/10 text-(--pie-texto) transition hover:bg-(--acento) hover:text-white" href="#inicio">
              <i className="fa-solid fa-arrow-up"></i> Volver arriba
            </a>
          </div>
        </div>
      </footer>

      <dialog
        ref={lightbox}
        className="m-auto bg-transparent p-4 max-w-none max-h-none outline-none backdrop:bg-black/80 cursor-zoom-out"
        onClick={() => lightbox.current.close()}
      >
        {zoom.src && (
          <img className="max-w-[92vw] max-h-[88vh] w-auto h-auto rounded-xl shadow-2xl" src={zoom.src} alt={zoom.alt} />
        )}
      </dialog>
    </>
  );
}
