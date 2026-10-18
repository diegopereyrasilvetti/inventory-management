/*
 * REGLAS DE CÁLCULO DE IMPUESTOS Y COSTOS (Argentina)
 *
 * Es el ÚNICO lugar donde se calcula IVA, costo, Impuesto al Cheque y liquidación de IVA.
 * Las pantallas no repiten fórmulas: llaman a estas funciones. Son funciones puras (no leen la base
 * ni el navegador), por eso se pueden probar solas (ver impuestos.test.js).
 *
 * IMPORTANTE: todo lo que sale de acá son ESTIMACIONES para la gestión interna del negocio.
 * No son liquidaciones fiscales oficiales. Los porcentajes son configurables y conviene
 * confirmarlos con un contador.
 *
 * Convenciones:
 *  - Los importes están en pesos (ARS) y se redondean a centavos, mitad hacia arriba.
 *  - Las alícuotas y porcentajes se escriben como número "21" (= 21 %), no como 0,21.
 *  - Un costo DESCONOCIDO es null: nunca se trata como cero (ver costoDeVentas).
 */

export const AVISO_ESTIMACION =
  "Son estimaciones para la gestión interna del negocio, no una liquidación fiscal oficial. Confirmá los valores con tu contador.";

export const CONDICIONES = Object.freeze({
  responsable_inscripto: {
    nombre: "Responsable Inscripto",
    descripcion:
      "Discrimina el IVA en las facturas. El IVA de las ventas es una deuda con el fisco (débito fiscal) y el IVA de las compras con factura A se descuenta (crédito fiscal).",
  },
  monotributista: {
    nombre: "Monotributista",
    descripcion:
      "No discrimina el IVA: el precio de venta es todo ingreso. El IVA de las compras no se recupera, por lo que forma parte del costo. Paga una cuota mensual fija.",
  },
  exento: {
    nombre: "Exento",
    descripcion:
      "No cobra IVA en sus ventas y no tiene crédito fiscal: el IVA de las compras forma parte del costo.",
  },
});

export const CONFIG_FISCAL_DEFECTO = Object.freeze({
  condicionFiscal: "responsable_inscripto",
  alicuotaIvaGeneral: 21,
  alicuotasIva: Object.freeze([21, 10.5, 27, 0]), // 0 = operaciones exentas
  chequeActivo: true,
  chequePctCredito: 0.6,
  chequePctDebito: 0.6,
  chequePctComputable: 33, // % del impuesto que puede tomarse como pago a cuenta de otros impuestos
  monotributoCuotaMensual: 0,
  fechaInicioContabilidad: null, // AAAA-MM-DD: desde cuándo rigen costos e impuestos reales
});

/* ------------------------------------------------------------------ */
/* Redondeo                                                           */
/* ------------------------------------------------------------------ */

/** Redondea a centavos (mitad hacia arriba, también con negativos). */
export function redondear(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const centavos = Math.round(Math.abs(x) * 100 + 1e-7);
  return (Math.sign(x) * centavos) / 100;
}

/* ------------------------------------------------------------------ */
/* Condición fiscal                                                   */
/* ------------------------------------------------------------------ */

/** ¿Se discrimina el IVA en ventas y compras? Solo para Responsable Inscripto. */
export function discriminaIva(config = CONFIG_FISCAL_DEFECTO) {
  return config.condicionFiscal === "responsable_inscripto";
}

/** ¿El IVA de las compras puede tomarse como crédito fiscal? Solo para Responsable Inscripto. */
export function tomaCreditoFiscal(config = CONFIG_FISCAL_DEFECTO) {
  return config.condicionFiscal === "responsable_inscripto";
}

/** Alícuota que se aplica a una operación: 0 si no se discrimina IVA; si no, la indicada o la general. */
export function alicuotaAplicable(alicuota, config = CONFIG_FISCAL_DEFECTO) {
  if (!discriminaIva(config)) return 0;
  const a = alicuota === undefined || alicuota === null || alicuota === "" ? config.alicuotaIvaGeneral : Number(alicuota);
  return Number.isFinite(a) && a > 0 ? a : 0;
}

/* ------------------------------------------------------------------ */
/* IVA                                                                */
/* ------------------------------------------------------------------ */

/** Separa un total con IVA incluido en neto + IVA. Ej.: 121000 al 21 % -> neto 100000, IVA 21000. */
export function desglosarIva(totalConIva, alicuota) {
  const total = redondear(totalConIva);
  const a = Number(alicuota);
  if (!(a > 0)) return { neto: total, iva: 0, total, alicuota: 0 };
  const neto = redondear(total / (1 + a / 100));
  return { neto, iva: redondear(total - neto), total, alicuota: a };
}

/** Suma el IVA a un neto. Ej.: 100000 al 21 % -> IVA 21000, total 121000. */
export function agregarIva(neto, alicuota) {
  const n = redondear(neto);
  const a = Number(alicuota);
  if (!(a > 0)) return { neto: n, iva: 0, total: n, alicuota: 0 };
  const iva = redondear((n * a) / 100);
  return { neto: n, iva, total: redondear(n + iva), alicuota: a };
}

/**
 * IVA de una venta. Se carga el TOTAL (con IVA incluido) y se calcula el resto.
 * Si el negocio no discrimina IVA (monotributista o exento), todo el total es ingreso.
 * Devuelve { neto, iva, total, alicuota, debitoFiscal }. El débito fiscal NO es ingreso propio.
 */
export function ivaDeVenta({ total, alicuota }, config = CONFIG_FISCAL_DEFECTO) {
  const d = desglosarIva(total, alicuotaAplicable(alicuota, config));
  return { ...d, debitoFiscal: d.iva };
}

/**
 * IVA de una compra (o de un gasto con IVA). Se carga el TOTAL pagado.
 *  - creditoComputable: el IVA que se descuenta del IVA de las ventas (solo Responsable Inscripto,
 *    y solo si el comprobante da crédito fiscal; computaCredito=false para facturas B/C o tickets).
 *  - costoNeto: lo que realmente cuesta. Si el IVA se recupera, es el neto; si no, es el total.
 */
export function ivaDeCompra({ total, alicuota, computaCredito = true }, config = CONFIG_FISCAL_DEFECTO) {
  const totalRedondeado = redondear(total);
  const tasa = alicuotaAplicable(alicuota, config);
  const d = desglosarIva(totalRedondeado, tasa);
  const credito = tomaCreditoFiscal(config) && computaCredito ? d.iva : 0;
  return {
    neto: d.neto,
    iva: d.iva,
    total: totalRedondeado,
    alicuota: tasa,
    creditoComputable: credito,
    costoNeto: redondear(totalRedondeado - credito),
  };
}

/**
 * Liquidación estimada de IVA = débito fiscal - crédito fiscal computable.
 *  saldo > 0: IVA a pagar  ·  saldo < 0: saldo a favor.
 *  pagado: lo ya abonado, para saber cuánto queda pendiente.
 */
export function liquidacionIva({ debito = 0, credito = 0, pagado = 0 } = {}) {
  const saldo = redondear(debito - credito);
  const aPagar = Math.max(saldo, 0);
  return {
    debito: redondear(debito),
    credito: redondear(credito),
    saldo,
    aPagar,
    aFavor: Math.max(-saldo, 0),
    pagado: redondear(pagado),
    pendiente: redondear(Math.max(aPagar - pagado, 0)),
    pagadoDeMas: redondear(Math.max(pagado - aPagar, 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Costos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Costo unitario "comparable" de una compra, la base con la que se calcula el costo promedio:
 *  - Responsable Inscripto con crédito fiscal: costo SIN IVA.
 *  - Monotributista, Exento, o compra sin crédito fiscal: costo TOTAL (el IVA es parte del costo).
 * Así todos los costos que se promedian están en la misma base.
 * Ej.: 1210 con IVA 21 % -> 1000 (RI con crédito) o 1210 (monotributo).
 */
export function costoUnitarioComparable({ costoUnitarioConIva, alicuota, computaCredito = true }, config = CONFIG_FISCAL_DEFECTO) {
  const c = Number(costoUnitarioConIva);
  if (!Number.isFinite(c) || c < 0) return null;
  const tasa = alicuotaAplicable(alicuota, config);
  const recuperaIva = tomaCreditoFiscal(config) && computaCredito && tasa > 0;
  return redondear4(recuperaIva ? c / (1 + tasa / 100) : c);
}

/**
 * Costos que se guardan en un producto a partir del costo cargado (IVA incluido).
 * Vacío o inválido = costo DESCONOCIDO (null), nunca cero. Un 0 escrito a propósito sí es un costo conocido.
 * Devuelve { costoConIva, costo }: lo cargado y el costo comparable que usa el promedio ponderado.
 */
export function costosDeProducto({ costoConIva, alicuota }, config = CONFIG_FISCAL_DEFECTO) {
  const c = costoConIva === "" || costoConIva === null || costoConIva === undefined ? null : Number(costoConIva);
  if (c === null || !Number.isFinite(c) || c < 0) return { costoConIva: null, costo: null };
  return {
    costoConIva: redondear4(c),
    costo: costoUnitarioComparable({ costoUnitarioConIva: c, alicuota }, config),
  };
}

/**
 * Costo promedio ponderado después de una compra.
 *   (stock actual x costo actual + cantidad nueva x costo nuevo) / (stock actual + cantidad nueva)
 * Ambos costos tienen que estar en la misma base (ver costoUnitarioComparable).
 *
 * Costo desconocido: si hay stock pero su costo se desconoce (null), NO se puede promediar con
 * honestidad: el resultado queda desconocido (completo: false) hasta que se cargue el costo inicial.
 * Sin stock, el costo nuevo pasa a ser el costo del producto.
 */
export function costoPromedioPonderado({ stockActual, costoActual, cantidadNueva, costoNuevo }) {
  const stock = Math.max(Number(stockActual) || 0, 0);
  const cantidad = Number(cantidadNueva);
  const nuevo = costoNuevo === null || costoNuevo === undefined ? null : Number(costoNuevo);
  if (!(cantidad > 0) || nuevo === null || !Number.isFinite(nuevo) || nuevo < 0) {
    return { costo: costoActual ?? null, completo: stock === 0 || costoActual !== null && costoActual !== undefined, stock };
  }
  const stockFinal = stock + cantidad;
  if (stock === 0) return { costo: redondear4(nuevo), completo: true, stock: stockFinal };
  if (costoActual === null || costoActual === undefined) return { costo: null, completo: false, stock: stockFinal };
  const costo = (stock * Number(costoActual) + cantidad * nuevo) / stockFinal;
  return { costo: redondear4(costo), completo: true, stock: stockFinal };
}

/** Los costos unitarios se guardan con 4 decimales, para no perder precisión al promediar. */
export function redondear4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return (Math.sign(x) * Math.round(Math.abs(x) * 10000 + 1e-7)) / 10000;
}

/* ------------------------------------------------------------------ */
/* Compras                                                            */
/* ------------------------------------------------------------------ */

export const TIPOS_COMPROBANTE = Object.freeze({
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  ticket: "Ticket",
  sin_comprobante: "Sin comprobante",
});

/** ¿El comprobante da crédito fiscal de IVA? Solo la Factura A, y solo para un Responsable Inscripto. */
export function daCreditoFiscal(tipoComprobante, config = CONFIG_FISCAL_DEFECTO) {
  return tomaCreditoFiscal(config) && tipoComprobante === "factura_a";
}

/**
 * Un renglón de compra. Se carga el costo UNITARIO con IVA incluido (lo que se pagó por unidad).
 *  - alicuota: la del renglón o la del producto; vacía = la general.
 *  - computaCredito: si el comprobante da crédito fiscal (ver daCreditoFiscal).
 * Devuelve el total del renglón, su neto, IVA y crédito fiscal, y el costo unitario "comparable"
 * (sin IVA si el IVA se recupera, con IVA si no) que se usa para el costo promedio ponderado.
 */
export function lineaDeCompra({ cantidad, costoUnitarioConIva, alicuota, computaCredito }, config = CONFIG_FISCAL_DEFECTO) {
  const unitario = redondear4(costoUnitarioConIva);
  const total = redondear(Number(cantidad) * unitario);
  const d = ivaDeCompra({ total, alicuota, computaCredito }, config);
  return {
    cantidad: Number(cantidad),
    costoUnitarioConIva: unitario,
    alicuota: d.alicuota,
    total,
    neto: d.neto,
    iva: d.iva,
    creditoFiscal: d.creditoComputable,
    costoUnitario: costoUnitarioComparable({ costoUnitarioConIva: unitario, alicuota, computaCredito }, config),
  };
}

/** Estado de pago de una compra: 'anulada' | 'pagada' | 'parcial' | 'a_pagar'. pagado = suma de pagos NO anulados. */
export function estadoPagoCompra({ total, pagado, estado = "activa" }) {
  if (estado === "anulada") return "anulada";
  const saldo = redondear(total - pagado);
  if (saldo <= 0) return "pagada";
  return pagado > 0 ? "parcial" : "a_pagar";
}

/**
 * Costo de las mercaderías vendidas a partir de los renglones de las ventas.
 * Cada renglón tiene { cantidad, costoUnitario } con el costo guardado al momento de la venta.
 * Un renglón sin costo (null) NO cuenta como cero: se informa como incompleto.
 */
export function costoDeVentas(renglones) {
  let total = 0;
  let unidadesSinCosto = 0;
  let renglonesSinCosto = 0;
  for (const r of renglones) {
    const cantidad = Number(r.cantidad) || 0;
    if (r.costoUnitario === null || r.costoUnitario === undefined || !Number.isFinite(Number(r.costoUnitario))) {
      unidadesSinCosto += cantidad;
      renglonesSinCosto += 1;
    } else {
      total += cantidad * Number(r.costoUnitario);
    }
  }
  return {
    total: redondear(total), // suma solo lo conocido
    completo: renglonesSinCosto === 0,
    unidadesSinCosto,
    renglonesSinCosto,
  };
}

/* ------------------------------------------------------------------ */
/* Impuesto a los Débitos y Créditos Bancarios (Impuesto al Cheque)   */
/* ------------------------------------------------------------------ */

/** Impuesto de UN movimiento bancario. Solo si el impuesto está activo y el movimiento está alcanzado. */
export function impuestoChequeMovimiento({ tipo, importe, alcanzado = true }, config = CONFIG_FISCAL_DEFECTO) {
  if (!config.chequeActivo || alcanzado === false) return 0;
  const monto = Number(importe);
  if (!(monto > 0)) return 0;
  if (tipo === "credito") return redondear((monto * config.chequePctCredito) / 100);
  if (tipo === "debito") return redondear((monto * config.chequePctDebito) / 100);
  return 0;
}

/** Impuesto total de una lista de movimientos, separado en créditos y débitos. */
export function impuestoCheque(movimientos, config = CONFIG_FISCAL_DEFECTO) {
  let credito = 0;
  let debito = 0;
  for (const m of movimientos) {
    const impuesto = impuestoChequeMovimiento(m, config);
    if (m.tipo === "credito") credito += impuesto;
    else if (m.tipo === "debito") debito += impuesto;
  }
  return { credito: redondear(credito), debito: redondear(debito), total: redondear(credito + debito) };
}

/**
 * Reparte el impuesto efectivamente soportado entre:
 *  - computable: la parte que puede tomarse como pago a cuenta de otros impuestos (no es un gasto), y
 *  - gastoFinanciero: el resto, que sí es un costo del negocio.
 * Así no se cuenta dos veces: lo computable no se resta de la ganancia.
 */
export function descomponerCheque(totalImpuesto, config = CONFIG_FISCAL_DEFECTO) {
  const total = redondear(totalImpuesto);
  const computable = redondear((total * (config.chequePctComputable || 0)) / 100);
  return { total, computable, gastoFinanciero: redondear(total - computable) };
}

/* ------------------------------------------------------------------ */
/* Configuración: normalizar y validar                                */
/* ------------------------------------------------------------------ */

const numero = (v, porDefecto) => {
  if (v === "" || v === null || v === undefined) return porDefecto;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Completa lo que falte con los valores por defecto y convierte textos en números. */
export function normalizarConfig(entrada = {}) {
  const base = CONFIG_FISCAL_DEFECTO;
  const alicuotasEntrada = Array.isArray(entrada.alicuotasIva) ? entrada.alicuotasIva : base.alicuotasIva;
  const config = {
    condicionFiscal: entrada.condicionFiscal ?? base.condicionFiscal,
    alicuotaIvaGeneral: numero(entrada.alicuotaIvaGeneral, base.alicuotaIvaGeneral),
    alicuotasIva: alicuotasEntrada.map((a) => numero(a, NaN)),
    chequeActivo: entrada.chequeActivo === undefined ? base.chequeActivo : Boolean(entrada.chequeActivo),
    chequePctCredito: numero(entrada.chequePctCredito, base.chequePctCredito),
    chequePctDebito: numero(entrada.chequePctDebito, base.chequePctDebito),
    chequePctComputable: numero(entrada.chequePctComputable, base.chequePctComputable),
    monotributoCuotaMensual: numero(entrada.monotributoCuotaMensual, base.monotributoCuotaMensual),
    fechaInicioContabilidad: entrada.fechaInicioContabilidad ?? base.fechaInicioContabilidad,
  };
  // Sin repetidos y ordenadas; la alícuota general siempre tiene que estar en la lista
  if (Number.isFinite(config.alicuotaIvaGeneral) && !config.alicuotasIva.includes(config.alicuotaIvaGeneral)) {
    config.alicuotasIva.push(config.alicuotaIvaGeneral);
  }
  config.alicuotasIva = [...new Set(config.alicuotasIva)].sort((a, b) => b - a);
  return config;
}

/** Devuelve la lista de problemas de una configuración: [{ campo, mensaje }]. Vacía = válida. */
export function validarConfig(config) {
  const problemas = [];
  const fuera = (campo, mensaje) => problemas.push({ campo, mensaje });
  const porcentaje = (campo, etiqueta, v, max = 100) => {
    if (!Number.isFinite(v) || v < 0 || v > max) fuera(campo, etiqueta + " tiene que ser un número entre 0 y " + max + ".");
  };

  if (!Object.keys(CONDICIONES).includes(config.condicionFiscal)) fuera("condicionFiscal", "Elegí una condición fiscal válida.");
  porcentaje("alicuotaIvaGeneral", "La alícuota general de IVA", config.alicuotaIvaGeneral);
  if (!Array.isArray(config.alicuotasIva) || config.alicuotasIva.length === 0) {
    fuera("alicuotasIva", "Tiene que haber al menos una alícuota de IVA.");
  } else if (config.alicuotasIva.length > 12) {
    fuera("alicuotasIva", "Hay demasiadas alícuotas (máximo 12).");
  } else if (config.alicuotasIva.some((a) => !Number.isFinite(a) || a < 0 || a > 100)) {
    fuera("alicuotasIva", "Cada alícuota de IVA tiene que ser un número entre 0 y 100.");
  } else if (!config.alicuotasIva.includes(config.alicuotaIvaGeneral)) {
    fuera("alicuotaIvaGeneral", "La alícuota general tiene que estar entre las alícuotas disponibles.");
  }
  porcentaje("chequePctCredito", "El porcentaje de créditos bancarios", config.chequePctCredito);
  porcentaje("chequePctDebito", "El porcentaje de débitos bancarios", config.chequePctDebito);
  porcentaje("chequePctComputable", "El porcentaje computable como pago a cuenta", config.chequePctComputable);
  if (!Number.isFinite(config.monotributoCuotaMensual) || config.monotributoCuotaMensual < 0) {
    fuera("monotributoCuotaMensual", "La cuota mensual tiene que ser un importe de 0 en adelante.");
  }
  if (config.fechaInicioContabilidad && !/^\d{4}-\d{2}-\d{2}$/.test(config.fechaInicioContabilidad)) {
    fuera("fechaInicioContabilidad", "La fecha de inicio no es válida.");
  }
  return problemas;
}
