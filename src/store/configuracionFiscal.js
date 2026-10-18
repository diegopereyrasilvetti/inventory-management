import { useMemo } from "react";
import { db, guardar, ok } from "./db.js";
import { invalidar, useConsulta } from "./consultas.js";
import { CONFIG_FISCAL_DEFECTO, normalizarConfig } from "../lib/impuestos.js";

const CLAVE = "configuracion_fiscal";

async function pedir() {
  return ok(await db().from("configuracion_fiscal").select("*").eq("id", 1));
}

/** Fila de la base -> configuración que entienden las funciones de lib/impuestos.js */
const aConfig = (f) =>
  normalizarConfig({
    condicionFiscal: f.condicion_fiscal,
    alicuotaIvaGeneral: f.alicuota_iva_general,
    alicuotasIva: (f.alicuotas_iva || []).map(Number),
    chequeActivo: f.cheque_activo,
    chequePctCredito: f.cheque_pct_credito,
    chequePctDebito: f.cheque_pct_debito,
    chequePctComputable: f.cheque_pct_computable,
    monotributoCuotaMensual: f.monotributo_cuota_mensual,
    fechaInicioContabilidad: f.fecha_inicio_contabilidad,
  });

const aFila = (c, saldoInicial) => ({
  condicion_fiscal: c.condicionFiscal,
  alicuota_iva_general: c.alicuotaIvaGeneral,
  alicuotas_iva: c.alicuotasIva,
  cheque_activo: c.chequeActivo,
  cheque_pct_credito: c.chequePctCredito,
  cheque_pct_debito: c.chequePctDebito,
  cheque_pct_computable: c.chequePctComputable,
  monotributo_cuota_mensual: c.monotributoCuotaMensual,
  saldo_inicial: saldoInicial,
});

/**
 * Configuración fiscal de la empresa (todos la ven; solo los administradores la cambian).
 * Devuelve { config, saldoInicial, cargando, guardarConfig(config, saldoInicial), activarContabilidad() }.
 * Mientras carga (o si la tabla todavía no existe) `config` es la configuración por defecto.
 */
export function useConfiguracionFiscal() {
  const { datos, cargando, error } = useConsulta(CLAVE, pedir);

  const { config, saldoInicial, existe } = useMemo(() => {
    const fila = datos[0];
    return {
      config: fila ? aConfig(fila) : normalizarConfig(CONFIG_FISCAL_DEFECTO),
      saldoInicial: fila ? Number(fila.saldo_inicial) : 0,
      existe: Boolean(fila),
    };
  }, [datos]);

  const guardarConfig = (nueva, nuevoSaldo) =>
    guardar(async () => {
      ok(await db().from("configuracion_fiscal").update(aFila(nueva, nuevoSaldo)).eq("id", 1));
      invalidar(CLAVE);
    });

  /** Fija la fecha de inicio de la nueva contabilidad en HOY. Después ya no se puede mover. */
  const activarContabilidad = () =>
    guardar(async () => {
      const hoy = new Date();
      const fecha = [hoy.getFullYear(), String(hoy.getMonth() + 1).padStart(2, "0"), String(hoy.getDate()).padStart(2, "0")].join("-");
      ok(await db().from("configuracion_fiscal").update({ fecha_inicio_contabilidad: fecha }).eq("id", 1));
      invalidar(CLAVE);
    });

  return { config, saldoInicial, existe, cargando, error, guardarConfig, activarContabilidad };
}
