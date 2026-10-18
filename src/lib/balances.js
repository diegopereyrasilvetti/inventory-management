/*
 * CÁLCULO DE BALANCES (ingresos, IVA, costos, ganancia)
 *
 * Funciones puras: reciben las ventas, compras y gastos ya cargados en la app y devuelven los números del período.
 * No leen la base ni el navegador, por eso se pueden probar solas (ver balances.test.js). Las pantallas no repiten
 * estas cuentas: llaman a estas funciones.
 *
 * IMPORTANTE: son ESTIMACIONES para la gestión interna del negocio, no una liquidación fiscal oficial.
 *
 * Cómo se separa el tiempo (para no contar nada dos veces):
 *   La "fecha de inicio de la nueva contabilidad" (Configuración fiscal) divide el historial en dos:
 *   - ANTERIOR (fechas < inicio): se calcula como siempre se hizo: ventas (con IVA incluido) menos gastos, y los gastos
 *     de "Mercadería y proveedores" cuentan como costo. No hay desglose de IVA.
 *   - NUEVA (fechas >= inicio): reglas nuevas. Ingresos sin IVA, costo de lo vendido tomado de cada venta (costo
 *     histórico), crédito fiscal de las compras, y las compras NO se restan como gasto (entran como costo al venderse).
 *   Si la contabilidad todavía no se activó (sin fecha), todo el historial es ANTERIOR.
 *   Un período que cruza la fecha devuelve las dos partes por separado: nunca se suman entre sí.
 *
 * Reglas de la parte NUEVA:
 *   - Los ingresos facturados son el total de TODAS las ventas, incluidas las registradas "sin IVA discriminado".
 *   - El IVA de las ventas es el que se guardó en cada venta (no se vuelve a calcular con la configuración de hoy).
 *   - Un costo desconocido (null) NUNCA se toma como cero: el resultado se marca como incompleto.
 *   - El crédito fiscal es el guardado en cada compra ACTIVA (solo Factura A de un Responsable Inscripto). No se infiere
 *     del precio. Las compras anuladas no cuentan.
 *   - Los gastos todavía no tienen IVA propio: se toman por su monto completo (conservador).
 *   - Una venta sin desglose en el período nuevo no se estima: se cuenta por su total y se marca el IVA como incompleto.
 */
import { costoDeVentas, liquidacionIva, redondear } from "./impuestos.js";

export const CATEGORIA_MERCADERIA = "Mercadería y proveedores";

/** Suma importes sin arrastrar errores de decimales (se acumula en centavos). */
function sumar(valores) {
  return redondear(valores.reduce((total, v) => total + Math.round((Number(v) || 0) * 100), 0) / 100);
}

/** Porcentaje con 2 decimales, o null si no hay base sobre la que calcularlo. */
function porcentaje(parte, base) {
  if (!(base > 0)) return null;
  return Math.round((parte / base) * 10000) / 100;
}

const entre = (fecha, desde, hasta) => fecha >= desde && fecha <= hasta;

/* ------------------------------------------------------------------ */
/* Parte ANTERIOR a la nueva contabilidad (cálculo de siempre)        */
/* ------------------------------------------------------------------ */

function calcularAnterior({ ventas, gastos }) {
  const ingresos = sumar(ventas.map((v) => v.total));
  const costoMercaderia = sumar(gastos.filter((g) => g.categoria === CATEGORIA_MERCADERIA).map((g) => g.monto));
  const otrosGastos = sumar(gastos.filter((g) => g.categoria !== CATEGORIA_MERCADERIA).map((g) => g.monto));
  const ganancia = redondear(ingresos - costoMercaderia - otrosGastos);
  return {
    tipo: "anterior",
    ventasCantidad: ventas.length,
    ingresos,
    costoMercaderia,
    otrosGastos,
    ganancia,
    margen: porcentaje(ganancia, ingresos),
    desgloseDisponible: false,
  };
}

/* ------------------------------------------------------------------ */
/* Parte NUEVA (desde la fecha de inicio)                             */
/* ------------------------------------------------------------------ */

function calcularNueva({ ventas, compras, gastos, config }) {
  const conDesglose = ventas.filter((v) => v.neto !== null && v.neto !== undefined);
  const sinDesglose = ventas.filter((v) => v.neto === null || v.neto === undefined);
  const sinIvaDiscriminado = ventas.filter((v) => v.sinIva === true);

  const totalFacturado = sumar(ventas.map((v) => v.total));
  const ivaVentas = sumar(conDesglose.map((v) => v.iva));
  // Las ventas sin desglose no se estiman: cuentan por su total y se avisa que el IVA está incompleto
  const ingresosSinIva = sumar([...conDesglose.map((v) => v.neto), ...sinDesglose.map((v) => v.total)]);

  // IVA abierto por alícuota (no todo está al 21 %), a partir de los renglones que traen su desglose
  const grupos = new Map();
  for (const v of conDesglose) {
    for (const it of v.items || []) {
      if (it.iva === null || it.iva === undefined || it.alicuotaIva === null || it.alicuotaIva === undefined) continue;
      const g = grupos.get(it.alicuotaIva) || { alicuota: it.alicuotaIva, netos: [], ivas: [] };
      g.netos.push(it.neto);
      g.ivas.push(it.iva);
      grupos.set(it.alicuotaIva, g);
    }
  }
  const ivaPorAlicuota = [...grupos.values()]
    .map((g) => ({ alicuota: g.alicuota, base: sumar(g.netos), iva: sumar(g.ivas) }))
    .sort((a, b) => b.alicuota - a.alicuota);

  // Costo de lo vendido: el costo guardado en cada renglón al momento de vender
  const renglones = ventas.flatMap((v) => (v.items || []).map((it) => ({ cantidad: it.cantidad, costoUnitario: it.costoUnitario })));
  const costo = costoDeVentas(renglones);

  // Crédito fiscal de las compras ACTIVAS (el que quedó guardado en cada una)
  const activas = compras.filter((c) => c.estado === "activa");
  const creditoFiscal = sumar(activas.map((c) => c.creditoFiscal));

  const gastosMercaderia = sumar(gastos.filter((g) => g.categoria === CATEGORIA_MERCADERIA).map((g) => g.monto));
  const otrosGastos = sumar(gastos.map((g) => g.monto));

  const gananciaBruta = redondear(ingresosSinIva - costo.total);
  const gananciaEstimada = redondear(gananciaBruta - otrosGastos);

  return {
    tipo: "nueva",
    condicionFiscal: config?.condicionFiscal ?? null,
    ventasCantidad: ventas.length,
    totalFacturado,
    ingresosSinIva,
    ivaVentas,
    ivaPorAlicuota,
    ventasSinIva: { cantidad: sinIvaDiscriminado.length, total: sumar(sinIvaDiscriminado.map((v) => v.total)) },
    ventasSinDesglose: { cantidad: sinDesglose.length, total: sumar(sinDesglose.map((v) => v.total)) },
    costoVentas: costo.total,
    costoCompleto: costo.completo,
    unidadesSinCosto: costo.unidadesSinCosto,
    gananciaBruta,
    otrosGastos,
    gastosMercaderia, // ya incluidos en otrosGastos: se informan aparte para avisar que van en Compras
    gananciaEstimada,
    margen: porcentaje(gananciaEstimada, ingresosSinIva),
    comprasCantidad: activas.length,
    comprasTotal: sumar(activas.map((c) => c.total)),
    creditoFiscal,
    iva: liquidacionIva({ debito: ivaVentas, credito: creditoFiscal }), // saldo > 0: a pagar; saldo < 0: a favor
    incompleto: { costo: !costo.completo, iva: sinDesglose.length > 0 },
  };
}

/* ------------------------------------------------------------------ */
/* Resumen de un rango de fechas                                      */
/* ------------------------------------------------------------------ */

/**
 * Resumen financiero de un rango de fechas (inclusive), 'AAAA-MM-DD'.
 *  config: configuración fiscal (se usa fechaInicioContabilidad y condicionFiscal).
 * Devuelve { desde, hasta, inicio, cruza, anterior, nueva }:
 *  - anterior: cálculo de siempre para las fechas anteriores al inicio (o null si el rango no las incluye)
 *  - nueva: cálculo con IVA y costo histórico para las fechas desde el inicio (o null si el rango no las incluye)
 *  - cruza: true si el rango tiene las dos partes (se muestran por separado)
 */
export function resumenFinanciero({ ventas = [], compras = [], gastos = [], config = {}, desde, hasta }) {
  const inicio = config.fechaInicioContabilidad || null;
  const enRango = (x) => entre(x.fecha, desde, hasta);
  const v = ventas.filter(enRango);
  const c = compras.filter(enRango);
  const g = gastos.filter(enRango);

  const incluyeAnterior = inicio === null || desde < inicio;
  const incluyeNueva = inicio !== null && hasta >= inicio;
  const antes = (x) => inicio === null || x.fecha < inicio;
  const despues = (x) => inicio !== null && x.fecha >= inicio;

  return {
    desde,
    hasta,
    inicio,
    cruza: incluyeAnterior && incluyeNueva,
    anterior: incluyeAnterior ? calcularAnterior({ ventas: v.filter(antes), gastos: g.filter(antes) }) : null,
    nueva: incluyeNueva
      ? calcularNueva({ ventas: v.filter(despues), compras: c.filter(despues), gastos: g.filter(despues), config })
      : null,
  };
}

/**
 * Un resumen por cada período (para los gráficos de evolución).
 * periodos: [{ clave, desde, hasta }]  ->  [{ clave, ...resumenFinanciero }]
 */
export function resumenPorPeriodos({ ventas, compras, gastos, config, periodos }) {
  return periodos.map((p) => ({ clave: p.clave, ...resumenFinanciero({ ventas, compras, gastos, config, desde: p.desde, hasta: p.hasta }) }));
}

/* ------------------------------------------------------------------ */
/* Períodos para la pantalla de Balances                              */
/* ------------------------------------------------------------------ */

/** El día anterior a una fecha 'AAAA-MM-DD' (sin depender de la zona horaria del equipo). */
export function diaAnterior(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Parte en dos los períodos que cruzan la fecha de inicio de la nueva contabilidad, para que cada tramo use un solo
 * criterio de cálculo (antes / desde el inicio) y nunca se mezclen. Los demás períodos quedan igual.
 * periodos: [{ etiqueta, titulo, desde, hasta }]
 */
export function dividirPeriodosEnInicio(periodos, inicio) {
  if (!inicio) return periodos.map((p) => ({ ...p }));
  const salida = [];
  for (const p of periodos) {
    if (p.desde < inicio && p.hasta >= inicio) {
      salida.push({ ...p, hasta: diaAnterior(inicio), etiqueta: p.etiqueta + " ant.", titulo: p.titulo + " (antes de la nueva contabilidad)" });
      salida.push({ ...p, desde: inicio, titulo: p.titulo + " (desde la nueva contabilidad)" });
    } else {
      salida.push({ ...p });
    }
  }
  return salida;
}

/**
 * Todo lo que necesita la pantalla de Balances para un conjunto de períodos.
 * Devuelve:
 *  - lista: un elemento por período (ya partido en la fecha de inicio) con ing, costo, otros, egr y gan para el gráfico y
 *    la tabla, más tipoCalculo ('nueva' | 'anterior') y el resumen completo de ese tramo.
 *      'nueva':    ing = ingresos SIN IVA, costo = costo de lo vendido, otros = gastos, gan = ganancia estimada.
 *      'anterior': ing = ventas con IVA incluido, costo = gastos de mercadería, otros = resto de gastos (como siempre).
 *  - totales: del rango completo. Si hay parte nueva, son los de la parte nueva (tipo 'nueva'); si no, los del cálculo
 *    anterior (tipo 'anterior'). Nunca se suman las dos.
 *  - legado: el resultado de la parte anterior cuando el rango también tiene parte nueva (o null).
 *  - resumen: el resumen completo del rango.
 */
export function balancePorPeriodos({ ventas = [], compras = [], gastos = [], config = {}, periodos }) {
  const partes = dividirPeriodosEnInicio(periodos, config.fechaInicioContabilidad || null);
  const datos = { ventas, compras, gastos, config };

  const aCampos = (parte) =>
    parte.tipo === "nueva"
      ? { ing: parte.ingresosSinIva, costo: parte.costoVentas, otros: parte.otrosGastos, gan: parte.gananciaEstimada }
      : { ing: parte.ingresos, costo: parte.costoMercaderia, otros: parte.otrosGastos, gan: parte.ganancia };

  const lista = partes.map((p) => {
    const r = resumenFinanciero({ ...datos, desde: p.desde, hasta: p.hasta });
    const parte = r.nueva ?? r.anterior;
    const campos = aCampos(parte);
    return { ...p, ...campos, egr: redondear(campos.costo + campos.otros), tipoCalculo: parte.tipo, resumen: parte };
  });

  const resumen = resumenFinanciero({ ...datos, desde: partes[0].desde, hasta: partes[partes.length - 1].hasta });
  const parteTotal = resumen.nueva ?? resumen.anterior;
  const campos = aCampos(parteTotal);
  const totales = { ...campos, egr: redondear(campos.costo + campos.otros), tipo: parteTotal.tipo, resumen: parteTotal };

  const a = resumen.nueva && resumen.anterior ? resumen.anterior : null;
  const legado = a && (a.ingresos !== 0 || a.costoMercaderia !== 0 || a.otrosGastos !== 0) ? a : null;

  return { lista, totales, legado, resumen };
}
