import useTheme from "../hooks/useTheme.js";

/**
 * Interruptor clickeable con un sol y una luna chicos: la perilla se desliza hacia el tema activo.
 * `conTexto` agrega la etiqueta a la izquierda (se usa en el menú de usuario); `className` se aplica al botón.
 */
export default function ToggleTema({ className = "", conTexto = false }) {
  const { theme, toggle } = useTheme();
  const oscuro = theme === "dark";
  const etiqueta = oscuro ? "Activar modo claro" : "Activar modo oscuro";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={oscuro}
      aria-label={conTexto ? undefined : "Modo oscuro"}
      title={etiqueta}
      className={"inline-flex items-center justify-between gap-3 cursor-pointer " + className}
      onClick={toggle}
    >
      {conTexto && <span>Modo oscuro</span>}
      <span className="relative flex h-7 w-14 shrink-0 items-center justify-between rounded-full border border-(--borde) bg-(--fondo) px-2 text-[11px] text-(--texto-suave)" aria-hidden="true">
        <i className="fa-solid fa-sun"></i>
        <i className="fa-solid fa-moon"></i>
        <span
          className={"absolute left-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-(--boton) text-[11px] text-white transition-transform " + (oscuro ? "translate-x-7" : "translate-x-0")}
        >
          <i className={"fa-solid " + (oscuro ? "fa-moon" : "fa-sun")}></i>
        </span>
      </span>
    </button>
  );
}
