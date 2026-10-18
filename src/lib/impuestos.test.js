import test from "node:test";
import assert from "node:assert/strict";
import {
  redondear,
  desglosarIva,
  agregarIva,
  ivaDeVenta,
  ivaDeCompra,
  liquidacionIva,
  costoUnitarioComparable,
  costoPromedioPonderado,
  costosDeProducto,
  costoDeVentas,
  impuestoChequeMovimiento,
  impuestoCheque,
  descomponerCheque,
  normalizarConfig,
  validarConfig,
  CONFIG_FISCAL_DEFECTO,
} from "./impuestos.js";

const RI = CONFIG_FISCAL_DEFECTO;
const MONO = { ...CONFIG_FISCAL_DEFECTO, condicionFiscal: "monotributista" };
const EXENTO = { ...CONFIG_FISCAL_DEFECTO, condicionFiscal: "exento" };

test("redondear: centavos, mitad hacia arriba y negativos", () => {
  assert.equal(redondear(1.005), 1.01);
  assert.equal(redondear(-1.005), -1.01);
  assert.equal(redondear(10.004), 10);
  assert.equal(redondear("abc"), 0);
});

test("desglosar IVA: ejemplo del pedido (121000 al 21%)", () => {
  assert.deepEqual(desglosarIva(121000, 21), { neto: 100000, iva: 21000, total: 121000, alicuota: 21 });
  assert.deepEqual(desglosarIva(1000, 0), { neto: 1000, iva: 0, total: 1000, alicuota: 0 });
  const d = desglosarIva(100, 21);
  assert.equal(redondear(d.neto + d.iva), 100); // neto + IVA siempre suman el total
});

test("agregar IVA es la inversa de desglosar", () => {
  assert.deepEqual(agregarIva(100000, 21), { neto: 100000, iva: 21000, total: 121000, alicuota: 21 });
  assert.equal(agregarIva(100, 10.5).total, 110.5);
});

test("IVA de venta según condición fiscal", () => {
  const ri = ivaDeVenta({ total: 121000, alicuota: 21 }, RI);
  assert.equal(ri.neto, 100000);
  assert.equal(ri.debitoFiscal, 21000);
  assert.equal(ivaDeVenta({ total: 121000 }, RI).iva, 21000); // sin alícuota: usa la general
  assert.equal(ivaDeVenta({ total: 121000, alicuota: 0 }, RI).iva, 0); // producto exento
  for (const c of [MONO, EXENTO]) {
    const v = ivaDeVenta({ total: 121000, alicuota: 21 }, c);
    assert.equal(v.neto, 121000);
    assert.equal(v.debitoFiscal, 0);
  }
});

test("IVA de compra: crédito solo para Responsable Inscripto con comprobante que lo da", () => {
  const ri = ivaDeCompra({ total: 121000, alicuota: 21 }, RI);
  assert.equal(ri.creditoComputable, 21000);
  assert.equal(ri.costoNeto, 100000);
  const sinCredito = ivaDeCompra({ total: 121000, alicuota: 21, computaCredito: false }, RI);
  assert.equal(sinCredito.creditoComputable, 0);
  assert.equal(sinCredito.costoNeto, 121000);
  assert.equal(ivaDeCompra({ total: 121000, alicuota: 21 }, MONO).costoNeto, 121000);
  assert.equal(ivaDeCompra({ total: 121000, alicuota: 21 }, EXENTO).creditoComputable, 0);
});

test("liquidación de IVA: a pagar, a favor y pendiente", () => {
  assert.deepEqual(liquidacionIva({ debito: 21000, credito: 5000, pagado: 6000 }), {
    debito: 21000, credito: 5000, saldo: 16000, aPagar: 16000, aFavor: 0, pagado: 6000, pendiente: 10000, pagadoDeMas: 0,
  });
  const favor = liquidacionIva({ debito: 1000, credito: 4000 });
  assert.equal(favor.aPagar, 0);
  assert.equal(favor.aFavor, 3000);
  assert.equal(liquidacionIva({ debito: 100, credito: 0, pagado: 150 }).pagadoDeMas, 50);
});

test("costo unitario comparable: misma base para promediar", () => {
  assert.equal(costoUnitarioComparable({ costoUnitarioConIva: 1210, alicuota: 21 }, RI), 1000);
  assert.equal(costoUnitarioComparable({ costoUnitarioConIva: 1210, alicuota: 21 }, MONO), 1210);
  assert.equal(costoUnitarioComparable({ costoUnitarioConIva: 1210, alicuota: 21, computaCredito: false }, RI), 1210);
  assert.equal(costoUnitarioComparable({ costoUnitarioConIva: -5 }, RI), null);
  assert.equal(costoUnitarioComparable({ costoUnitarioConIva: "x" }, RI), null);
});

test("costo promedio ponderado", () => {
  assert.deepEqual(costoPromedioPonderado({ stockActual: 10, costoActual: 100, cantidadNueva: 10, costoNuevo: 200 }), { costo: 150, completo: true, stock: 20 });
  // sin stock: el costo nuevo manda, aunque el anterior fuera otro
  assert.equal(costoPromedioPonderado({ stockActual: 0, costoActual: 999, cantidadNueva: 5, costoNuevo: 80 }).costo, 80);
  // stock con costo desconocido: no se inventa un promedio
  const desconocido = costoPromedioPonderado({ stockActual: 10, costoActual: null, cantidadNueva: 10, costoNuevo: 200 });
  assert.equal(desconocido.costo, null);
  assert.equal(desconocido.completo, false);
  assert.equal(costoPromedioPonderado({ stockActual: 3, costoActual: 10, cantidadNueva: 1, costoNuevo: 11 }).costo, 10.25);
  // compra sin costo informado: no cambia nada
  assert.equal(costoPromedioPonderado({ stockActual: 5, costoActual: 10, cantidadNueva: 5, costoNuevo: null }).costo, 10);
});

test("costo de ventas: el costo desconocido NO es cero", () => {
  const completo = costoDeVentas([{ cantidad: 2, costoUnitario: 100 }, { cantidad: 1, costoUnitario: 50.5 }]);
  assert.deepEqual(completo, { total: 250.5, completo: true, unidadesSinCosto: 0, renglonesSinCosto: 0 });
  const incompleto = costoDeVentas([{ cantidad: 2, costoUnitario: 100 }, { cantidad: 3, costoUnitario: null }]);
  assert.equal(incompleto.total, 200);
  assert.equal(incompleto.completo, false);
  assert.equal(incompleto.unidadesSinCosto, 3);
  // un costo de 0 declarado SÍ es un costo conocido
  assert.equal(costoDeVentas([{ cantidad: 1, costoUnitario: 0 }]).completo, true);
});

test("Impuesto al Cheque: solo movimientos alcanzados y según tasas configuradas", () => {
  assert.equal(impuestoChequeMovimiento({ tipo: "credito", importe: 100000 }, RI), 600);
  assert.equal(impuestoChequeMovimiento({ tipo: "debito", importe: 100000 }, RI), 600);
  assert.equal(impuestoChequeMovimiento({ tipo: "credito", importe: 100000, alcanzado: false }, RI), 0);
  assert.equal(impuestoChequeMovimiento({ tipo: "credito", importe: 100000 }, { ...RI, chequeActivo: false }), 0);
  assert.equal(impuestoChequeMovimiento({ tipo: "credito", importe: 100000 }, { ...RI, chequePctCredito: 1 }), 1000);
  const r = impuestoCheque(
    [
      { tipo: "credito", importe: 100000 },
      { tipo: "debito", importe: 50000 },
      { tipo: "credito", importe: 999999, alcanzado: false },
    ],
    RI
  );
  assert.deepEqual(r, { credito: 600, debito: 300, total: 900 });
});

test("cheque: lo computable no es gasto", () => {
  assert.deepEqual(descomponerCheque(900, RI), { total: 900, computable: 297, gastoFinanciero: 603 });
  assert.deepEqual(descomponerCheque(900, { ...RI, chequePctComputable: 0 }), { total: 900, computable: 0, gastoFinanciero: 900 });
});

test("configuración: normalizar y validar", () => {
  const c = normalizarConfig({});
  assert.deepEqual(validarConfig(c), []);
  assert.deepEqual(c.alicuotasIva, [27, 21, 10.5, 0]);
  const texto = normalizarConfig({ alicuotaIvaGeneral: "10,5", chequePctDebito: "0,6" });
  assert.equal(texto.alicuotaIvaGeneral, 10.5);
  assert.equal(texto.chequePctDebito, 0.6);
  const mala = normalizarConfig({ condicionFiscal: "otra", chequePctCredito: 150, monotributoCuotaMensual: -1, fechaInicioContabilidad: "ayer" });
  const campos = validarConfig(mala).map((p) => p.campo);
  assert.deepEqual(campos.sort(), ["chequePctCredito", "condicionFiscal", "fechaInicioContabilidad", "monotributoCuotaMensual"].sort());
  assert.ok(validarConfig(normalizarConfig({ alicuotaIvaGeneral: "abc" })).length > 0);
});

test("costos de producto: lo cargado y el costo comparable", () => {
  assert.deepEqual(costosDeProducto({ costoConIva: 1210, alicuota: 21 }, RI), { costoConIva: 1210, costo: 1000 });
  assert.deepEqual(costosDeProducto({ costoConIva: "1210", alicuota: null }, RI), { costoConIva: 1210, costo: 1000 }); // sin alícuota: usa la general
  assert.deepEqual(costosDeProducto({ costoConIva: 1210, alicuota: 21 }, MONO), { costoConIva: 1210, costo: 1210 });
  assert.deepEqual(costosDeProducto({ costoConIva: 500, alicuota: 0 }, RI), { costoConIva: 500, costo: 500 }); // producto exento
  assert.deepEqual(costosDeProducto({ costoConIva: 0, alicuota: 21 }, RI), { costoConIva: 0, costo: 0 }); // 0 declarado = conocido
  for (const vacio of ["", null, undefined, "abc", -5]) {
    assert.deepEqual(costosDeProducto({ costoConIva: vacio, alicuota: 21 }, RI), { costoConIva: null, costo: null });
  }
});
