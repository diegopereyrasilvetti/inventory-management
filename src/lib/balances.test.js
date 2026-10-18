import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIA_MERCADERIA, resumenFinanciero, resumenPorPeriodos } from "./balances.js";
import { CONFIG_FISCAL_DEFECTO, desglosarIva, ivaDeVenta, ivaDeCompra } from "./impuestos.js";

const INICIO = "2026-10-17";
const RI = { ...CONFIG_FISCAL_DEFECTO, condicionFiscal: "responsable_inscripto", fechaInicioContabilidad: INICIO };
const MONO = { ...CONFIG_FISCAL_DEFECTO, condicionFiscal: "monotributista", fechaInicioContabilidad: INICIO };
const RANGO = { desde: "2026-10-17", hasta: "2026-10-31" };

/** Una venta como la entrega la app (useFinanzas). Con el total con IVA incluido, el desglose se calcula como lo hace la base. */
function venta({ id = 1, fecha = "2026-10-20", total, alicuota = 21, costoUnitario = null, cantidad = 1, sinIva = false, sinDesglose = false, config = RI }) {
  if (sinDesglose) {
    return { id, fecha, total, neto: null, iva: null, condicionFiscal: null, sinIva: false, items: [{ cantidad, precio: total / cantidad, alicuotaIva: null, neto: null, iva: null, costoUnitario }] };
  }
  const d = ivaDeVenta({ total, alicuota: sinIva ? 0 : alicuota }, config);
  return {
    id, fecha, total, neto: d.neto, iva: d.iva, condicionFiscal: config.condicionFiscal, sinIva,
    items: [{ cantidad, precio: total / cantidad, alicuotaIva: d.alicuota, neto: d.neto, iva: d.iva, costoUnitario }],
  };
}
const gasto = (monto, categoria = "Alquiler", fecha = "2026-10-20") => ({ fecha, categoria, monto });
const compra = ({ total, creditoFiscal = 0, estado = "activa", fecha = "2026-10-20" }) => ({ fecha, estado, total, neto: total - creditoFiscal, iva: creditoFiscal, creditoFiscal });
const calcular = (datos, config = RI, rango = RANGO) => resumenFinanciero({ ...datos, config, ...rango });

test("el ejemplo del pedido: 20.000 con IVA -> neto 16.528,93, IVA 3.471,07, ganancia 7.528,93", () => {
  const r = calcular({
    ventas: [venta({ total: 20000, costoUnitario: 8000 })],
    gastos: [gasto(1000)],
  }).nueva;
  assert.equal(r.totalFacturado, 20000);
  assert.equal(r.ivaVentas, 3471.07);
  assert.equal(r.ingresosSinIva, 16528.93);
  assert.equal(r.costoVentas, 8000);
  assert.equal(r.gananciaBruta, 8528.93);
  assert.equal(r.otrosGastos, 1000);
  assert.equal(r.gananciaEstimada, 7528.93);
  assert.equal(r.margen, 45.55);
  assert.deepEqual(r.incompleto, { costo: false, iva: false });
});

test("el IVA incluido se calcula dividiendo por 1,21 (no multiplicando por 0,21)", () => {
  const d = desglosarIva(20000, 21);
  assert.equal(d.neto, 16528.93);
  assert.equal(d.iva, 3471.07);
  assert.notEqual(d.iva, 4200); // 20.000 x 0,21 estaría MAL
  const r = calcular({ ventas: [venta({ total: 20000 })] }).nueva;
  assert.equal(r.ivaVentas, 3471.07);
  assert.equal(r.ingresosSinIva + r.ivaVentas, r.totalFacturado);
});

test("IVA de varias alícuotas: se abre por alícuota (no todo es 21 %)", () => {
  const r = calcular({ ventas: [venta({ id: 1, total: 12100, alicuota: 21 }), venta({ id: 2, total: 11050, alicuota: 10.5 }), venta({ id: 3, total: 500, alicuota: 0 })] }).nueva;
  assert.equal(r.totalFacturado, 23650);
  assert.equal(r.ivaVentas, 3150);
  assert.deepEqual(r.ivaPorAlicuota, [
    { alicuota: 21, base: 10000, iva: 2100 },
    { alicuota: 10.5, base: 10000, iva: 1050 },
    { alicuota: 0, base: 500, iva: 0 },
  ]);
  assert.equal(r.ingresosSinIva, 20500);
});

test("venta 'sin IVA discriminado': cuenta completa en los ingresos y se informa aparte", () => {
  const r = calcular({ ventas: [venta({ id: 1, total: 20000, sinIva: true }), venta({ id: 2, total: 12100 })] }).nueva;
  assert.equal(r.totalFacturado, 32100); // la venta sin IVA NO desaparece
  assert.equal(r.ivaVentas, 2100); // solo el IVA de la otra venta
  assert.equal(r.ingresosSinIva, 30000); // 20.000 completos + 10.000 netos
  assert.deepEqual(r.ventasSinIva, { cantidad: 1, total: 20000 });
});

test("monotributista: sin IVA de ventas ni crédito fiscal; el ingreso es el total", () => {
  const r = calcular(
    { ventas: [venta({ total: 20000, costoUnitario: 12100, config: MONO })], compras: [compra({ total: 5000, creditoFiscal: 0 })] },
    MONO,
  ).nueva;
  assert.equal(r.ivaVentas, 0);
  assert.equal(r.creditoFiscal, 0);
  assert.equal(r.ingresosSinIva, 20000);
  assert.equal(r.costoVentas, 12100); // el IVA de la compra es parte del costo
  assert.equal(r.iva.aPagar, 0);
  assert.equal(r.gananciaEstimada, 7900);
});

test("responsable inscripto vs monotributista: la misma venta de 20.000 da ingresos distintos", () => {
  const ri = calcular({ ventas: [venta({ total: 20000 })] }).nueva;
  const mono = calcular({ ventas: [venta({ total: 20000, config: MONO })] }, MONO).nueva;
  assert.equal(ri.ingresosSinIva, 16528.93);
  assert.equal(mono.ingresosSinIva, 20000);
  assert.equal(ri.totalFacturado, mono.totalFacturado);
});

test("crédito fiscal: solo compras activas con crédito guardado; no se infiere del precio", () => {
  const compras = [
    compra({ total: 13310, creditoFiscal: 2310 }), // Factura A
    compra({ total: 4400, creditoFiscal: 0 }), // Factura B: sin crédito
    compra({ total: 6050, creditoFiscal: 1050, estado: "anulada" }), // anulada: no cuenta
  ];
  const r = calcular({ ventas: [venta({ total: 20000 })], compras }).nueva;
  assert.equal(r.creditoFiscal, 2310);
  assert.equal(r.comprasCantidad, 2);
  assert.equal(r.comprasTotal, 17710);
  assert.equal(r.iva.debito, 3471.07);
  assert.equal(r.iva.saldo, 1161.07); // 3.471,07 - 2.310
  assert.equal(r.iva.aPagar, 1161.07);
  assert.equal(r.iva.aFavor, 0);
});

test("IVA neto: si el crédito supera al débito queda saldo a favor", () => {
  const r = calcular({ ventas: [venta({ total: 1210 })], compras: [compra({ total: 13310, creditoFiscal: 2310 })] }).nueva;
  assert.equal(r.iva.debito, 210);
  assert.equal(r.iva.saldo, -2100);
  assert.equal(r.iva.aPagar, 0);
  assert.equal(r.iva.aFavor, 2100);
});

test("el crédito fiscal calculado por la compra coincide con lo que suma el balance", () => {
  const c = ivaDeCompra({ total: 13310, alicuota: 21, computaCredito: true }, RI);
  const r = calcular({ compras: [compra({ total: 13310, creditoFiscal: c.creditoComputable })] }).nueva;
  assert.equal(r.creditoFiscal, c.creditoComputable);
  assert.equal(r.creditoFiscal, 2310);
});

test("las compras NO restan de la ganancia (solo entran como costo al venderse)", () => {
  const base = { ventas: [venta({ total: 20000, costoUnitario: 8000 })], gastos: [gasto(1000)] };
  const sin = calcular(base).nueva;
  const con = calcular({ ...base, compras: [compra({ total: 500000, creditoFiscal: 86776.86 })] }).nueva;
  assert.equal(con.gananciaEstimada, sin.gananciaEstimada);
  assert.equal(con.costoVentas, sin.costoVentas);
  assert.equal(con.otrosGastos, sin.otrosGastos);
});

test("costo desconocido: NO es cero; el resultado se marca incompleto", () => {
  const r = calcular({
    ventas: [venta({ id: 1, total: 12100, costoUnitario: 4000, cantidad: 2 }), venta({ id: 2, total: 6050, costoUnitario: null, cantidad: 3 })],
    gastos: [gasto(500)],
  }).nueva;
  assert.equal(r.costoVentas, 8000); // solo lo conocido
  assert.equal(r.costoCompleto, false);
  assert.equal(r.unidadesSinCosto, 3);
  assert.equal(r.incompleto.costo, true);
  assert.equal(r.gananciaEstimada, 15000 - 8000 - 500); // neto 10.000 + 5.000, menos lo conocido
  // un costo 0 declarado a propósito SÍ es un costo conocido
  assert.equal(calcular({ ventas: [venta({ total: 1000, costoUnitario: 0 })] }).nueva.incompleto.costo, false);
});

test("costos y gastos: la ganancia sale de ingresos sin IVA menos costo de ventas y otros gastos", () => {
  const r = calcular({
    ventas: [venta({ id: 1, total: 24200, costoUnitario: 6000, cantidad: 2 }), venta({ id: 2, total: 12100, costoUnitario: 5000 })],
    gastos: [gasto(1500), gasto(700, "Servicios (luz, agua, internet)")],
  }).nueva;
  assert.equal(r.ingresosSinIva, 30000);
  assert.equal(r.costoVentas, 17000);
  assert.equal(r.otrosGastos, 2200);
  assert.equal(r.gananciaEstimada, 10800);
  assert.equal(r.margen, 36);
});

test("no se duplican impuestos: ingresos sin IVA + IVA = total facturado, y el IVA no entra como gasto", () => {
  const r = calcular({ ventas: [venta({ id: 1, total: 20000 }), venta({ id: 2, total: 7777.77, alicuota: 10.5 }), venta({ id: 3, total: 333.33 })] }).nueva;
  assert.equal(redondear2(r.ingresosSinIva + r.ivaVentas), r.totalFacturado);
  assert.equal(r.otrosGastos, 0); // el IVA no se descuenta además como gasto
  assert.equal(r.gananciaBruta, r.ingresosSinIva);
});
const redondear2 = (n) => Math.round(n * 100) / 100;

test("gastos de 'Mercadería y proveedores' en el período nuevo: se cuentan como gasto y se avisa", () => {
  const r = calcular({ ventas: [venta({ total: 12100, costoUnitario: 4000 })], gastos: [gasto(300, CATEGORIA_MERCADERIA), gasto(200)] }).nueva;
  assert.equal(r.otrosGastos, 500);
  assert.equal(r.gastosMercaderia, 300);
  assert.equal(r.gananciaEstimada, 10000 - 4000 - 500);
});

test("histórico: antes de la fecha de inicio se calcula como siempre (con IVA incluido, mercadería = costo)", () => {
  const datos = {
    ventas: [venta({ id: 1, fecha: "2026-10-10", total: 1000, sinDesglose: true }), venta({ id: 2, fecha: "2026-10-20", total: 20000, costoUnitario: 8000 })],
    gastos: [gasto(300, CATEGORIA_MERCADERIA, "2026-10-10"), gasto(100, "Alquiler", "2026-10-10"), gasto(1000, "Alquiler", "2026-10-21")],
    compras: [compra({ total: 1210, creditoFiscal: 210, fecha: "2026-10-10" })],
  };
  const r = calcular(datos, RI, { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(r.cruza, true);
  assert.deepEqual(r.anterior, {
    tipo: "anterior", ventasCantidad: 1, ingresos: 1000, costoMercaderia: 300, otrosGastos: 100, ganancia: 600, margen: 60, desgloseDisponible: false,
  });
  assert.equal(r.nueva.totalFacturado, 20000); // la venta vieja NO se mezcla con la nueva
  assert.equal(r.nueva.otrosGastos, 1000);
  assert.equal(r.nueva.comprasCantidad, 0); // la compra vieja no aporta crédito a la parte nueva
  assert.equal(r.nueva.creditoFiscal, 0);
});

test("histórico: un rango solo anterior, solo posterior, y sin contabilidad activada", () => {
  const datos = { ventas: [venta({ fecha: "2026-10-10", total: 1000, sinDesglose: true }), venta({ id: 2, fecha: "2026-10-20", total: 500 })] };
  const antes = calcular(datos, RI, { desde: "2026-10-01", hasta: "2026-10-16" });
  assert.equal(antes.nueva, null);
  assert.equal(antes.cruza, false);
  assert.equal(antes.anterior.ingresos, 1000);
  const despues = calcular(datos, RI, { desde: "2026-10-17", hasta: "2026-10-31" });
  assert.equal(despues.anterior, null);
  assert.equal(despues.nueva.totalFacturado, 500);
  // el mismo día de inicio ya es contabilidad nueva
  assert.equal(calcular({ ventas: [venta({ fecha: INICIO, total: 100 })] }, RI, { desde: INICIO, hasta: INICIO }).nueva.totalFacturado, 100);
  // sin fecha de inicio: todo es anterior (la nueva contabilidad no está activa)
  const sinActivar = calcular(datos, { ...RI, fechaInicioContabilidad: null }, { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(sinActivar.nueva, null);
  assert.equal(sinActivar.anterior.ingresos, 1500);
});

test("venta sin desglose dentro del período nuevo: no se inventa el IVA; se marca incompleto", () => {
  const r = calcular({ ventas: [venta({ id: 1, total: 12100 }), venta({ id: 2, total: 500, sinDesglose: true })] }).nueva;
  assert.equal(r.totalFacturado, 12600);
  assert.equal(r.ivaVentas, 2100); // solo el de la venta que tiene desglose
  assert.equal(r.ingresosSinIva, 10500); // 10.000 netos + 500 completos (sin estimar)
  assert.deepEqual(r.ventasSinDesglose, { cantidad: 1, total: 500 });
  assert.equal(r.incompleto.iva, true);
  assert.equal(r.incompleto.costo, true); // además, de esa venta no se conoce el costo
});

test("precisión decimal: mil ventas de centavos suman exacto", () => {
  const ventas = Array.from({ length: 1000 }, (_, i) => ({
    id: i, fecha: "2026-10-20", total: 0.1, neto: 0.08, iva: 0.02, condicionFiscal: "responsable_inscripto", sinIva: false,
    items: [{ cantidad: 1, precio: 0.1, alicuotaIva: 21, neto: 0.08, iva: 0.02, costoUnitario: 0.03 }],
  }));
  const r = calcular({ ventas }).nueva;
  assert.equal(r.totalFacturado, 100);
  assert.equal(r.ivaVentas, 20);
  assert.equal(r.ingresosSinIva, 80);
  assert.equal(r.costoVentas, 30);
  assert.equal(r.gananciaEstimada, 50);
});

test("el rango incluye los dos extremos y excluye lo de afuera", () => {
  const ventas = [venta({ id: 1, fecha: "2026-10-16", total: 1 }), venta({ id: 2, fecha: "2026-10-17", total: 10 }), venta({ id: 3, fecha: "2026-10-31", total: 100 }), venta({ id: 4, fecha: "2026-11-01", total: 1000 })];
  assert.equal(calcular({ ventas }).nueva.totalFacturado, 110);
});

test("sin datos: todo en cero, sin errores y sin margen", () => {
  const r = calcular({}).nueva;
  assert.equal(r.totalFacturado, 0);
  assert.equal(r.ivaVentas, 0);
  assert.equal(r.gananciaEstimada, 0);
  assert.equal(r.margen, null);
  assert.deepEqual(r.ivaPorAlicuota, []);
  assert.deepEqual(r.incompleto, { costo: false, iva: false });
});

test("pérdida: la ganancia puede ser negativa y el margen también", () => {
  const r = calcular({ ventas: [venta({ total: 12100, costoUnitario: 9000 })], gastos: [gasto(2000)] }).nueva;
  assert.equal(r.gananciaEstimada, -1000);
  assert.equal(r.margen, -10);
});

test("resumen por períodos: uno por cada tramo (para los gráficos)", () => {
  const ventas = [venta({ id: 1, fecha: "2026-10-17", total: 1210 }), venta({ id: 2, fecha: "2026-10-18", total: 2420 }), venta({ id: 3, fecha: "2026-10-25", total: 12100 })];
  const lista = resumenPorPeriodos({
    ventas, compras: [], gastos: [], config: RI,
    periodos: [
      { clave: "s1", desde: "2026-10-17", hasta: "2026-10-23" },
      { clave: "s2", desde: "2026-10-24", hasta: "2026-10-30" },
    ],
  });
  assert.deepEqual(lista.map((p) => [p.clave, p.nueva.totalFacturado, p.nueva.ivaVentas]), [["s1", 3630, 630], ["s2", 12100, 2100]]);
});

test("la venta guardada con la regla de la base y la del balance coinciden con la venta de Diego (sustrato 20.000)", () => {
  // Valores reales de tu pantalla de Ventas
  const r = calcular({ ventas: [venta({ total: 20000, costoUnitario: null }), venta({ id: 2, total: 15000, costoUnitario: 991.7355 })] }).nueva;
  assert.equal(r.totalFacturado, 35000);
  assert.equal(r.ivaVentas, 6074.38); // 3.471,07 + 2.603,31
  assert.equal(r.ingresosSinIva, 28925.62);
  assert.equal(r.costoVentas, 991.74); // el sustrato no tiene costo: no cuenta como cero
  assert.equal(r.incompleto.costo, true);
});

/* ---------- Períodos para la pantalla ---------- */
import { balancePorPeriodos, diaAnterior, dividirPeriodosEnInicio } from "./balances.js";

test("el día anterior no depende de la zona horaria y cruza meses y años", () => {
  assert.equal(diaAnterior("2026-10-17"), "2026-10-16");
  assert.equal(diaAnterior("2026-11-01"), "2026-10-31");
  assert.equal(diaAnterior("2027-01-01"), "2026-12-31");
  assert.equal(diaAnterior("2028-03-01"), "2028-02-29"); // año bisiesto
});

test("un período que cruza la fecha de inicio se parte en dos; los demás quedan igual", () => {
  const periodos = [
    { etiqueta: "1–7", titulo: "Del 1 al 7", desde: "2026-10-01", hasta: "2026-10-07" },
    { etiqueta: "15–21", titulo: "Del 15 al 21", desde: "2026-10-15", hasta: "2026-10-21" },
    { etiqueta: "22–28", titulo: "Del 22 al 28", desde: "2026-10-22", hasta: "2026-10-28" },
  ];
  const r = dividirPeriodosEnInicio(periodos, "2026-10-17");
  assert.deepEqual(r.map((p) => [p.etiqueta, p.desde, p.hasta]), [
    ["1–7", "2026-10-01", "2026-10-07"],
    ["15–21 ant.", "2026-10-15", "2026-10-16"],
    ["15–21", "2026-10-17", "2026-10-21"],
    ["22–28", "2026-10-22", "2026-10-28"],
  ]);
  assert.equal(dividirPeriodosEnInicio(periodos, null).length, 3); // sin inicio no se parte nada
  assert.equal(dividirPeriodosEnInicio(periodos, "2026-10-15").length, 3); // si el inicio es el primer día, tampoco
  assert.equal(dividirPeriodosEnInicio(periodos, "2026-12-01").length, 3); // inicio futuro
});

test("balance por períodos: tramo nuevo sin IVA, tramo anterior como siempre, y los totales no los mezclan", () => {
  const periodos = [{ etiqueta: "oct", titulo: "Octubre", desde: "2026-10-01", hasta: "2026-10-31" }];
  const ventas = [
    venta({ id: 1, fecha: "2026-10-10", total: 1000, sinDesglose: true }), // anterior: con IVA incluido, sin desglose
    venta({ id: 2, fecha: "2026-10-20", total: 20000, costoUnitario: 8000 }),
  ];
  const gastos = [gasto(300, CATEGORIA_MERCADERIA, "2026-10-10"), gasto(1000, "Alquiler", "2026-10-21")];
  const b = balancePorPeriodos({ ventas, gastos, compras: [], config: RI, periodos });
  assert.equal(b.lista.length, 2);
  assert.deepEqual(b.lista.map((p) => [p.etiqueta, p.tipoCalculo]), [["oct ant.", "anterior"], ["oct", "nueva"]]);
  // tramo anterior: 1.000 de ventas, 300 de mercadería como costo
  assert.deepEqual([b.lista[0].ing, b.lista[0].costo, b.lista[0].otros, b.lista[0].gan], [1000, 300, 0, 700]);
  // tramo nuevo: ingresos SIN IVA, costo histórico y ganancia estimada
  assert.deepEqual([b.lista[1].ing, b.lista[1].costo, b.lista[1].otros, b.lista[1].gan], [16528.93, 8000, 1000, 7528.93]);
  // los totales son los de la parte nueva: no se suma lo anterior
  assert.equal(b.totales.tipo, "nueva");
  assert.deepEqual([b.totales.ing, b.totales.costo, b.totales.otros, b.totales.gan], [16528.93, 8000, 1000, 7528.93]);
  assert.equal(b.totales.egr, 9000);
  assert.deepEqual([b.legado.ingresos, b.legado.costoMercaderia, b.legado.ganancia], [1000, 300, 700]);
});

test("balance por períodos: sin la nueva contabilidad todo se calcula como siempre", () => {
  const periodos = [{ etiqueta: "oct", titulo: "Octubre", desde: "2026-10-01", hasta: "2026-10-31" }];
  const ventas = [venta({ id: 1, fecha: "2026-10-20", total: 20000, costoUnitario: 8000 })];
  const b = balancePorPeriodos({ ventas, gastos: [gasto(1000)], compras: [], config: { ...RI, fechaInicioContabilidad: null }, periodos });
  assert.equal(b.lista.length, 1);
  assert.equal(b.totales.tipo, "anterior");
  assert.equal(b.totales.ing, 20000); // con IVA incluido, como antes
  assert.equal(b.totales.gan, 19000);
  assert.equal(b.legado, null);
});

test("balance por períodos: el tramo anterior vacío no genera aviso de legado", () => {
  const periodos = [{ etiqueta: "oct", titulo: "Octubre", desde: "2026-10-01", hasta: "2026-10-31" }];
  const b = balancePorPeriodos({ ventas: [venta({ total: 12100, costoUnitario: 1000 })], gastos: [], compras: [], config: RI, periodos });
  assert.equal(b.totales.tipo, "nueva");
  assert.equal(b.legado, null);
});

test("balance por períodos: un rango solo anterior a la fecha de inicio usa el cálculo de siempre", () => {
  const periodos = [{ etiqueta: "sep", titulo: "Septiembre", desde: "2026-09-01", hasta: "2026-09-30" }];
  const b = balancePorPeriodos({ ventas: [venta({ fecha: "2026-09-10", total: 5000, sinDesglose: true })], gastos: [], compras: [], config: RI, periodos });
  assert.equal(b.totales.tipo, "anterior");
  assert.equal(b.totales.ing, 5000);
  assert.equal(b.lista[0].tipoCalculo, "anterior");
});
