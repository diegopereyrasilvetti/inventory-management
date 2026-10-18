import { useEffect, useRef, useState } from "react";
import { CLASE_BOTON_ACCESO } from "../../components/LayoutAcceso.jsx";
import SeccionDashboard from "../../components/SeccionDashboard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import useTitulo from "../../hooks/useTitulo.js";
import {
  AVISO_ESTIMACION,
  CONDICIONES,
  descomponerCheque,
  discriminaIva,
  ivaDeVenta,
  normalizarConfig,
  validarConfig,
} from "../../lib/impuestos.js";
import { MONEDA } from "../../store/finanzas.js";
import { useConfiguracionFiscal } from "../../store/configuracionFiscal.js";

const CLASE_INPUT =
  "w-full rounded-lg border border-(--borde) bg-(--fondo) px-3 py-2.5 text-sm focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30 disabled:opacity-60";

const fechaLarga = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
const aTexto = (n) => String(n).replace(".", ",");

/** Estado del formulario (todo como texto, para poder escribir con coma) a partir de la configuración guardada. */
function aFormulario(config, saldoInicial) {
  return {
    condicionFiscal: config.condicionFiscal,
    alicuotaIvaGeneral: aTexto(config.alicuotaIvaGeneral),
    alicuotasIva: config.alicuotasIva.map(aTexto).join(", "),
    chequeActivo: config.chequeActivo,
    chequePctCredito: aTexto(config.chequePctCredito),
    chequePctDebito: aTexto(config.chequePctDebito),
    chequePctComputable: aTexto(config.chequePctComputable),
    monotributoCuotaMensual: aTexto(config.monotributoCuotaMensual),
    saldoInicial: aTexto(saldoInicial),
  };
}

/** Formulario -> configuración numérica (sin completar nada por su cuenta: lo inválido queda NaN y se informa). */
function aConfig(f, fechaInicio) {
  const lista = f.alicuotasIva.split(/[\s;]+|,(?=\s)/).map((x) => x.trim()).filter(Boolean);
  return normalizarConfig({
    condicionFiscal: f.condicionFiscal,
    alicuotaIvaGeneral: f.alicuotaIvaGeneral,
    alicuotasIva: lista.length ? lista : [],
    chequeActivo: f.chequeActivo,
    chequePctCredito: f.chequePctCredito,
    chequePctDebito: f.chequePctDebito,
    chequePctComputable: f.chequePctComputable,
    monotributoCuotaMensual: f.monotributoCuotaMensual,
    fechaInicioContabilidad: fechaInicio,
  });
}

function Campo({ id, etiqueta, ayuda, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-(--texto)" htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-(--texto-suave)">{ayuda}</p>}
      {error && <p className="text-xs text-(--stock-agotado)" role="alert">{error}</p>}
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-(--borde) px-5 py-5 sm:px-6">
      <legend className="sr-only">{titulo}</legend>
      <h2 className="text-base font-bold text-(--texto)" aria-hidden="true">{titulo}</h2>
      {children}
    </fieldset>
  );
}

/** Configuración fiscal: la ven todas las personas activas; solo los administradores la modifican. */
export default function ConfiguracionFiscal() {
  useTitulo("Configuración fiscal | Gestión de Stock");
  const { esAdmin } = useAuth();
  const { config, saldoInicial, existe, cargando, guardarConfig, activarContabilidad } = useConfiguracionFiscal();
  const [form, setForm] = useState(() => aFormulario(config, saldoInicial));
  const [intento, setIntento] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Cuando llega (o cambia) lo guardado, el formulario lo refleja
  useEffect(() => {
    setForm(aFormulario(config, saldoInicial));
  }, [config, saldoInicial]);

  const campo = (nombre) => (e) => {
    const valor = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [nombre]: valor }));
    setGuardado(false);
  };

  const nueva = aConfig(form, config.fechaInicioContabilidad);
  const nuevoSaldo = Number(String(form.saldoInicial).replace(",", "."));
  const problemas = validarConfig(nueva);
  if (!Number.isFinite(nuevoSaldo)) problemas.push({ campo: "saldoInicial", mensaje: "El saldo inicial tiene que ser un importe." });
  const error = (nombre) => (intento ? problemas.find((p) => p.campo === nombre)?.mensaje : undefined);

  const sinPermiso = !esAdmin;
  const hayCambios = JSON.stringify(aFormulario(config, saldoInicial)) !== JSON.stringify(form);

  async function enviar(e) {
    e.preventDefault();
    setIntento(true);
    if (problemas.length) return;
    setEnviando(true);
    const ok = await guardarConfig(nueva, nuevoSaldo);
    setEnviando(false);
    setGuardado(ok);
    if (ok) setIntento(false);
  }

  const dialogoActivar = useRef(null);
  const [palabra, setPalabra] = useState("");
  const PALABRA_ACTIVAR = "ACTIVAR";

  function abrirActivar() {
    setPalabra("");
    dialogoActivar.current?.showModal();
  }

  async function activar(e) {
    e.preventDefault();
    if (palabra.trim().toUpperCase() !== PALABRA_ACTIVAR) return;
    dialogoActivar.current?.close();
    await activarContabilidad();
  }

  // Ejemplo en vivo con lo que está escrito, para entender qué hace cada valor
  const ejemploVenta = ivaDeVenta({ total: 121000, alicuota: nueva.alicuotaIvaGeneral }, nueva);
  const ejemploCheque = descomponerCheque(1000, nueva);

  return (
    <SeccionDashboard aria-labelledby="titulo-fiscal" className="max-w-3xl">
      <div className="px-5 pt-5 sm:px-6">
        <h1 id="titulo-fiscal" className="text-xl font-bold text-(--texto)">Configuración fiscal</h1>
        <p className="mt-0.5 text-sm text-(--texto-suave)">
          Define cómo se calculan el IVA, el Impuesto al Cheque y los costos en Ventas, Compras, Ganancias y Balances.
        </p>
        <p className="mt-3 rounded-lg border border-(--borde) bg-(--fondo) px-3.5 py-2.5 text-sm text-(--texto-suave)" role="note">
          <i className="fa-solid fa-circle-info mr-1.5"></i>
          {AVISO_ESTIMACION}
        </p>
        {sinPermiso && !cargando && (
          <p className="mt-3 text-sm font-medium text-(--texto)" role="status">
            Podés consultar esta configuración, pero solo un administrador puede modificarla.
          </p>
        )}
        {!cargando && !existe && (
          <p className="mt-3 text-sm text-(--stock-agotado)" role="alert">
            Todavía no se creó la configuración fiscal en la base de datos. Un administrador tiene que ejecutar el script
            07_configuracion_fiscal.sql en Supabase.
          </p>
        )}
      </div>

      <form className="mt-4" onSubmit={enviar} noValidate>
        <Bloque titulo="Condición fiscal del negocio">
          <Campo id="cf-condicion" etiqueta="Condición" error={error("condicionFiscal")}>
            <select id="cf-condicion" className={CLASE_INPUT} value={form.condicionFiscal} onChange={campo("condicionFiscal")} disabled={sinPermiso}>
              {Object.entries(CONDICIONES).map(([clave, c]) => (
                <option key={clave} value={clave}>{c.nombre}</option>
              ))}
            </select>
            <p className="text-sm text-(--texto-suave)">{CONDICIONES[form.condicionFiscal]?.descripcion}</p>
          </Campo>
          {form.condicionFiscal === "monotributista" && (
            <Campo id="cf-cuota" etiqueta="Cuota mensual de monotributo ($)" ayuda="Importe fijo que pagás cada mes. Se tiene en cuenta como un impuesto a pagar." error={error("monotributoCuotaMensual")}>
              <input id="cf-cuota" className={CLASE_INPUT} inputMode="decimal" value={form.monotributoCuotaMensual} onChange={campo("monotributoCuotaMensual")} disabled={sinPermiso} />
            </Campo>
          )}
        </Bloque>

        <Bloque titulo="IVA">
          <Campo id="cf-alicuota" etiqueta="Alícuota general (%)" ayuda="Es la que se propone para los productos nuevos. Los precios cargados se consideran finales, con el IVA incluido." error={error("alicuotaIvaGeneral")}>
            <input id="cf-alicuota" className={CLASE_INPUT} inputMode="decimal" value={form.alicuotaIvaGeneral} onChange={campo("alicuotaIvaGeneral")} disabled={sinPermiso} />
          </Campo>
          <Campo id="cf-alicuotas" etiqueta="Alícuotas disponibles (%)" ayuda="Separadas por espacio o punto y coma, por ejemplo: 21; 10,5; 27; 0. El 0 se usa para productos exentos." error={error("alicuotasIva")}>
            <input id="cf-alicuotas" className={CLASE_INPUT} value={form.alicuotasIva} onChange={campo("alicuotasIva")} disabled={sinPermiso} />
          </Campo>
          <p className="rounded-lg border border-(--borde) bg-(--fondo) px-3.5 py-2.5 text-sm text-(--texto)" data-ejemplo="iva">
            {discriminaIva(nueva) ? (
              <>
                Ejemplo: una venta de <strong>{MONEDA.format(121000)}</strong> al {aTexto(nueva.alicuotaIvaGeneral)} % tiene un neto de{" "}
                <strong>{MONEDA.format(ejemploVenta.neto)}</strong> y un IVA de <strong>{MONEDA.format(ejemploVenta.iva)}</strong>. Ese IVA
                no es ganancia: es una deuda con el fisco que se compensa con el IVA de tus compras.
              </>
            ) : (
              <>
                Con esta condición el IVA no se discrimina: una venta de <strong>{MONEDA.format(121000)}</strong> es ingreso por
                los <strong>{MONEDA.format(121000)}</strong>, y el IVA de tus compras forma parte del costo.
              </>
            )}
          </p>
        </Bloque>

        <Bloque titulo="Impuesto al Cheque (débitos y créditos bancarios)">
          <label className="flex items-center gap-2 text-sm font-semibold text-(--texto)">
            <input className="size-4 accent-(--acento-hover)" type="checkbox" checked={form.chequeActivo} onChange={campo("chequeActivo")} disabled={sinPermiso} />
            Calcular el Impuesto al Cheque
          </label>
          <p className="text-sm text-(--texto-suave)">
            Se calcula solo sobre movimientos bancarios que estén alcanzados por el impuesto, no sobre cada venta con tarjeta o
            transferencia. Los movimientos exentos se pueden marcar como tales.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="cf-ch-cred" etiqueta="Créditos (%)" error={error("chequePctCredito")}>
              <input id="cf-ch-cred" className={CLASE_INPUT} inputMode="decimal" value={form.chequePctCredito} onChange={campo("chequePctCredito")} disabled={sinPermiso || !form.chequeActivo} />
            </Campo>
            <Campo id="cf-ch-deb" etiqueta="Débitos (%)" error={error("chequePctDebito")}>
              <input id="cf-ch-deb" className={CLASE_INPUT} inputMode="decimal" value={form.chequePctDebito} onChange={campo("chequePctDebito")} disabled={sinPermiso || !form.chequeActivo} />
            </Campo>
            <Campo id="cf-ch-comp" etiqueta="Computable (%)" ayuda="Parte que puede tomarse como pago a cuenta de otros impuestos." error={error("chequePctComputable")}>
              <input id="cf-ch-comp" className={CLASE_INPUT} inputMode="decimal" value={form.chequePctComputable} onChange={campo("chequePctComputable")} disabled={sinPermiso || !form.chequeActivo} />
            </Campo>
          </div>
          {form.chequeActivo && (
            <p className="rounded-lg border border-(--borde) bg-(--fondo) px-3.5 py-2.5 text-sm text-(--texto)" data-ejemplo="cheque">
              Ejemplo: de cada <strong>{MONEDA.format(1000)}</strong> de impuesto pagado, <strong>{MONEDA.format(ejemploCheque.computable)}</strong> se
              toman como pago a cuenta (no es un gasto) y <strong>{MONEDA.format(ejemploCheque.gastoFinanciero)}</strong> son gasto financiero.
              Confirmá estos porcentajes con tu contador.
            </p>
          )}
        </Bloque>

        <Bloque titulo="Caja y nueva contabilidad">
          <Campo id="cf-saldo" etiqueta="Saldo inicial de caja y bancos ($)" ayuda="Con cuánto dinero arranca la nueva contabilidad. Sirve para calcular el dinero disponible." error={error("saldoInicial")}>
            <input id="cf-saldo" className={CLASE_INPUT} inputMode="decimal" value={form.saldoInicial} onChange={campo("saldoInicial")} disabled={sinPermiso} />
          </Campo>
          <div className="rounded-lg border border-(--borde) bg-(--fondo) px-3.5 py-3 text-sm" data-estado-contabilidad>
            {config.fechaInicioContabilidad ? (
              <p className="text-(--texto)">
                <i className="fa-solid fa-circle-check mr-1.5 text-(--viz-verde-texto)"></i>
                Nueva contabilidad activa desde el <strong>{fechaLarga(config.fechaInicioContabilidad)}</strong>. Lo anterior se mantiene
                como historial, sin recalcularse.
              </p>
            ) : (
              <>
                <p className="text-(--texto)">
                  La nueva contabilidad todavía <strong>no está activa</strong>. Al activarla se toma la fecha de hoy como inicio: desde ahí se
                  registran costos e impuestos reales y lo anterior queda como historial, para no contar nada dos veces. La fecha no se puede
                  cambiar después.
                </p>
                {esAdmin && existe && (
                  <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-full border border-(--acento-hover) px-4 py-2 text-sm font-semibold text-(--acento-hover) cursor-pointer transition hover:bg-(--superficie)" onClick={abrirActivar} disabled={hayCambios}>
                    <i className="fa-solid fa-play"></i> Activar con la fecha de hoy
                  </button>
                )}
                {esAdmin && hayCambios && <p className="mt-2 text-xs text-(--texto-suave)">Guardá los cambios antes de activar.</p>}
              </>
            )}
          </div>
        </Bloque>

        {esAdmin && (
          <div className="flex flex-wrap items-center gap-3 border-t border-(--borde) px-5 py-5 sm:px-6">
            <button className={CLASE_BOTON_ACCESO} type="submit" disabled={enviando || !existe}>
              {enviando ? "Guardando…" : "Guardar configuración"}
            </button>
            {intento && problemas.length > 0 && (
              <p className="text-sm text-(--stock-agotado)" role="alert">Revisá los campos marcados.</p>
            )}
            {guardado && !hayCambios && <p className="text-sm text-(--viz-verde-texto)" role="status">Configuración guardada.</p>}
          </div>
        )}
      </form>

      <dialog
        ref={dialogoActivar}
        className="m-auto w-[min(92vw,26rem)] rounded-xl border border-(--borde) bg-(--superficie) p-0 text-(--texto) backdrop:bg-black/50"
        aria-labelledby="titulo-activar"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={activar} noValidate>
          <h2 id="titulo-activar" className="text-base font-bold">Activar la nueva contabilidad</h2>
          <p className="text-sm text-(--texto-suave)">
            Se va a tomar la fecha de <strong className="text-(--texto)">hoy</strong> como inicio. Desde ahí se registran costos e impuestos
            reales. <strong className="text-(--texto)">Esta acción no se puede deshacer</strong> desde la aplicación.
          </p>
          <Campo id="cf-palabra" etiqueta={"Para confirmar, escribí " + PALABRA_ACTIVAR}>
            <input id="cf-palabra" className={CLASE_INPUT} autoComplete="off" value={palabra} onChange={(e) => setPalabra(e.target.value)} />
          </Campo>
          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-full border border-(--borde) px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-(--fondo)" onClick={() => dialogoActivar.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="rounded-full bg-(--acento-hover) px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--texto) disabled:cursor-not-allowed disabled:opacity-50" disabled={palabra.trim().toUpperCase() !== PALABRA_ACTIVAR}>
              Activar
            </button>
          </div>
        </form>
      </dialog>
    </SeccionDashboard>
  );
}
