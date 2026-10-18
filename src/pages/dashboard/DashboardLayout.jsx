import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icono from "../../components/Icono.jsx";
import MenuUsuario from "../../components/MenuUsuario.jsx";
import { LOGO, Marca } from "../../components/Logo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { nombreDe } from "../../lib/usuario.js";
import { estadoDe, useInventario } from "../../store/inventario.js";
import useTitulo from "../../hooks/useTitulo.js";

const SECCIONES = [
  { ruta: "/dashboard", texto: "Resumen", icono: "fa-gauge", fin: true },
  { ruta: "/dashboard/inventario", texto: "Inventario", icono: "fa-boxes-stacked" },
  { ruta: "/dashboard/productos", texto: "Productos", icono: "fa-tag" },
  { ruta: "/dashboard/documentacion", texto: "Documentación", icono: "fa-file-lines" },
  { ruta: "/dashboard/proveedores", texto: "Proveedores", icono: "fa-truck" },
  { ruta: "/dashboard/compras", texto: "Compras", icono: "fa-file-invoice-dollar" },
  { ruta: "/dashboard/ventas", texto: "Ventas", icono: "fa-cart-shopping" },
  { ruta: "/dashboard/balances", texto: "Balances", icono: "fa-scale-balanced" },
];

const CLASE_BUSCADOR =
  "text-sm rounded-lg bg-(--fondo) border border-(--borde) text-(--texto) placeholder:text-(--texto-suave)/60 focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30";
const CLASE_SOCIAL =
  "flex size-7 items-center justify-center rounded-full border border-[#e8dcc8]/25 text-xs text-[#e8dcc8] transition hover:bg-(--acento) hover:border-(--acento) hover:text-white";
const CLASE_LEGAL = "text-[#e8dcc8]/80 hover:text-white transition-colors";

function claseEnlaceNav(base) {
  return ({ isActive }) =>
    base +
    " font-medium text-(--texto-suave) hover:bg-(--fondo) hover:text-(--texto)" +
    (isActive ? " bg-(--fondo) text-(--acento-hover)" : "");
}

export default function DashboardLayout() {
  useTitulo("Panel | Gestión de Stock");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, perfil, esAdmin, cerrarSesion } = useAuth();
  const nombre = perfil?.nombre || nombreDe(user);
  const rolTexto = perfil?.rol === "admin" ? "Administrador" : "Usuario";
  const { productos } = useInventario();
  const [menuMovil, setMenuMovil] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);

  const alertas = productos.filter((p) => estadoDe(p) !== "disponible").length;

  // Al cambiar de sección: se cierran los menús y se vuelve arriba
  useEffect(() => {
    setMenuMovil(false);
    setMenuUsuario(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  // El menú de usuario se cierra al hacer clic afuera o con Escape
  useEffect(() => {
    function alClic(e) {
      if (!e.target.closest("[data-menu-usuario]")) setMenuUsuario(false);
    }
    function alTecla(e) {
      if (e.key === "Escape") {
        setMenuUsuario(false);
        setMenuMovil(false);
      }
    }
    document.addEventListener("click", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("click", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, []);

  // Cierra la sesión en Supabase y vuelve a la página de inicio
  async function salir() {
    await cerrarSesion();
    navigate("/", { replace: true });
  }

  const propsMenuUsuario = {
    abierto: menuUsuario,
    alAlternar: () => {
      setMenuMovil(false); // abrir el menú de usuario cierra el de navegación
      setMenuUsuario((v) => !v);
    },
    nombre,
    rolTexto,
    esAdmin,
    email: user?.email,
    alSalir: salir,
  };

  // La campana lleva a Alertas; si ya estás ahí, vuelve al inicio del panel
  function alTocarCampana(e) {
    if (pathname === "/dashboard/alertas") {
      e.preventDefault();
      navigate("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header id="inicio" className="sticky top-0 z-30 bg-(--superficie) border-b border-(--borde)">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 min-[360px]:px-4 sm:px-6 lg:px-8 xl:flex xl:justify-between xl:gap-4">
          <Link className="flex shrink-0 items-center gap-2 justify-self-start" to="/dashboard" aria-label="Ir al panel">
            <img className="block h-8 w-auto min-[360px]:h-9" src={LOGO} alt="Logo de Gestión De Stock" />
            <Marca className="hidden text-xl font-extrabold tracking-[0.02em] text-(--texto) sm:inline min-[360px]:sm:text-2xl" />
          </Link>

          <nav className="hidden xl:flex items-center gap-1" aria-label="Principal">
            {SECCIONES.map((s) => (
              <NavLink
                key={s.ruta}
                to={s.ruta}
                end={s.fin}
                className={claseEnlaceNav("flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition")}
              >
                {/* Con 8 secciones, en pantallas de 1280 a 1535 px los iconos no entran junto al nombre de usuario */}
                <i className={"fa-solid hidden 2xl:inline " + s.icono}></i> {s.texto}
              </NavLink>
            ))}
          </nav>

          <div className="min-w-0 justify-self-center xl:hidden">
            <MenuUsuario variante="centro" {...propsMenuUsuario} />
          </div>

          <div className="flex items-center justify-self-end gap-1 sm:gap-2 xl:justify-self-auto">
            <form className="relative hidden min-[1700px]:block" role="search" onSubmit={(e) => e.preventDefault()}>
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)"></i>
              <input className={"w-52 pl-8 pr-3 py-2 " + CLASE_BUSCADOR} type="search" name="buscar" placeholder="Buscar producto…" aria-label="Buscar producto" />
            </form>

            <Link
              className="relative flex size-9 items-center justify-center rounded-full text-(--texto) transition hover:bg-(--fondo) min-[360px]:size-10"
              to="/dashboard/alertas"
              onClick={alTocarCampana}
              aria-label={"Alertas de stock bajo (" + alertas + ")"}
            >
              <i className="fa-solid fa-bell"></i>
              {alertas > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-(--stock-agotado) text-[10px] font-bold leading-none text-white">
                  {alertas}
                </span>
              )}
            </Link>

            <div className="hidden xl:block">
              <MenuUsuario variante="derecha" {...propsMenuUsuario} />
            </div>

            <button
              className="xl:hidden flex size-9 min-[360px]:size-10 items-center justify-center rounded-full text-xl text-(--texto) cursor-pointer transition hover:bg-(--fondo)"
              type="button"
              aria-expanded={menuMovil}
              aria-controls="menu-movil"
              aria-label={menuMovil ? "Cerrar menú" : "Abrir menú"}
              onClick={() => {
                setMenuUsuario(false); // abrir el menú de navegación cierra el de usuario
                setMenuMovil((v) => !v);
              }}
            >
              <Icono clase={menuMovil ? "fa-solid fa-xmark" : "fa-solid fa-bars"} />
            </button>
          </div>
        </div>

        {menuMovil && (
          <nav id="menu-movil" className="xl:hidden border-t border-(--borde) bg-(--superficie) px-4 py-3 sm:px-6" aria-label="Principal">
            <form className="relative mb-3 md:hidden" role="search" onSubmit={(e) => e.preventDefault()}>
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-(--texto-suave)"></i>
              <input className={"w-full pl-8 pr-3 py-2.5 " + CLASE_BUSCADOR} type="search" name="buscar-movil" placeholder="Buscar producto…" aria-label="Buscar producto" />
            </form>
            <ul className="grid gap-1 sm:grid-cols-2">
              {SECCIONES.map((s) => (
                <li key={s.ruta}>
                  <NavLink
                    to={s.ruta}
                    end={s.fin}
                    className={claseEnlaceNav("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm")}
                  >
                    <i className={"fa-solid " + s.icono + " w-4 text-center"}></i> {s.texto}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="contenido" className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="bg-(--texto) text-[#e8dcc8]">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <a className="order-1 flex items-center gap-2" href="#inicio" aria-label="Gestión de Stock">
            <img className="block h-6 w-auto" src={LOGO} alt="" />
            <Marca azul="text-[#4d9bff]" className="text-lg font-bold tracking-[0.02em] text-white" />
          </a>

          <nav className="order-3 w-full md:order-2 md:w-auto" aria-label="Información legal">
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              <li><a className={CLASE_LEGAL} href="#politica-de-privacidad">Política de privacidad</a></li>
              <li><a className={CLASE_LEGAL} href="#terminos-y-condiciones">Términos y condiciones</a></li>
              <li><a className={CLASE_LEGAL} href="#politica-de-cookies">Política de cookies</a></li>
            </ul>
          </nav>

          <ul className="order-2 flex items-center gap-1.5 md:order-3">
            <li><a className={CLASE_SOCIAL} href="mailto:contacto@ejemplo.com" aria-label="Enviar un mail"><i className="fa-solid fa-envelope"></i></a></li>
            <li><a className={CLASE_SOCIAL} href="#" aria-label="Instagram"><i className="fa-brands fa-instagram"></i></a></li>
            <li><a className={CLASE_SOCIAL} href="#" aria-label="Facebook"><i className="fa-brands fa-facebook-f"></i></a></li>
            <li><a className={CLASE_SOCIAL} href="#" aria-label="X (Twitter)"><i className="fa-brands fa-x-twitter"></i></a></li>
            <li><a className={CLASE_SOCIAL} href="#" aria-label="WhatsApp"><i className="fa-brands fa-whatsapp"></i></a></li>
          </ul>
        </div>

        <div className="border-t border-[#e8dcc8]/15">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <p className="text-[11px] text-[#e8dcc8]/70">© 2026 Gestión de Stock. Todos los derechos reservados.</p>
            <a className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8dcc8]/10 px-2.5 py-1 text-[11px] text-[#e8dcc8] transition hover:bg-(--acento) hover:text-white" href="#inicio">
              <i className="fa-solid fa-arrow-up"></i> Volver arriba
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
