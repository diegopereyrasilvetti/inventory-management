import { useEffect, useState } from 'react';
import { useInventario, estadoDe } from '../store/inventario.js';
import { useFinanzas } from '../store/finanzas.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useStored } from '../store/useStored.js';
import { CLAVE_HISTORIAL } from '../store/claves.js';

const HISTORIAL_INICIAL = [];
const DIAS_PERIODO = 7;
const EJEMPLO = {
  pedidos: { actual: 46, antes: 38 },
  faltantes: { actual: 6, antes: 4 },
  inexistentes: { actual: 2, antes: 3 },
};

const C0 = 90;
const RADIO = 64;
const GROSOR = 28;
const SEPARACION = 4;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

function iso(fecha) {
  return fecha.toLocaleDateString('en-CA');
}
function diasAtras(n) {
  const h = new Date();
  return iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - n));
}

// 100 = igual que antes · 200 = el doble o más · 0 = desapareció
function indice(actual, antes) {
  if (antes === null) return 100;
  if (antes === 0) return actual === 0 ? 100 : 200;
  return Math.max(0, Math.min(200, (actual / antes) * 100));
}

function cambio(actual, antes) {
  if (antes === null) return { texto: 'Sin datos previos', delta: 0, sin: true };
  if (antes === 0) return actual === 0 ? { texto: 'Sin cambios', delta: 0 } : { texto: 'Nuevo', delta: 1 };
  const pct = Math.round(((actual - antes) / antes) * 100);
  return { texto: (pct > 0 ? '+' : pct < 0 ? '−' : '') + Math.abs(pct) + '%', delta: pct };
}

function CrecimientoAnillo({ ramas }) {
  const total = ramas.reduce((s, r) => s + r.indice, 0);
  const promedio = Math.round(total / ramas.length);
  const etiqueta =
    'Anillo del índice de crecimiento. Índice general ' + promedio + '. ' +
    ramas.map((r) => r.nombre + ': índice ' + Math.round(r.indice) + ' (' + r.cambio.texto + ')').join('. ') +
    '. 100 significa sin cambios respecto del período anterior.';

  let acumulado = 0;
  const porciones = [];
  ramas.forEach((r) => {
    const parte = total > 0 ? (r.indice / total) * CIRCUNFERENCIA : 0;
    const largo = Math.max(0, parte - SEPARACION);
    if (largo > 0) {
      porciones.push(
        <circle
          key={r.nombre}
          cx={C0}
          cy={C0}
          r={RADIO}
          fill="none"
          stroke={r.color}
          strokeWidth={GROSOR}
          strokeDasharray={largo.toFixed(2) + ' ' + (CIRCUNFERENCIA - largo).toFixed(2)}
          strokeDashoffset={(-(acumulado + SEPARACION / 2)).toFixed(2)}
          transform={'rotate(-90 ' + C0 + ' ' + C0 + ')'}
        />,
      );
    }
    acumulado += parte;
  });

  return (
    <svg viewBox="0 0 180 180" role="img" className="block h-auto w-full" aria-label={etiqueta}>
      <circle cx={C0} cy={C0} r={RADIO} fill="none" stroke="var(--viz-gris-fondo)" strokeWidth={GROSOR} />
      {porciones}
      <text x={C0} y={C0 + 2} textAnchor="middle" fontSize={32} fontWeight={700} fill="var(--texto)">{promedio}</text>
      <text x={C0} y={C0 + 21} textAnchor="middle" fontSize={10.5} fill="var(--texto-suave)">índice general</text>
    </svg>
  );
}

export default function Crecimiento() {
  const { productos, cargando } = useInventario();
  const { user } = useAuth();
  const { ventas } = useFinanzas();
  const [historial, setHistorial] = useStored(CLAVE_HISTORIAL + '-' + (user?.id || 'anonimo'), HISTORIAL_INICIAL);
  const [forzarEjemplo, setForzarEjemplo] = useState(null); // null = automático

  // Una "foto" por día de cuántos productos faltan y cuántos no existen en stock
  useEffect(() => {
    if (cargando) return; // hasta que lleguen los productos no hay nada que anotar
    const hoy = diasAtras(0);
    const faltantes = productos.filter((p) => estadoDe(p) === 'bajo').length;
    const inexistentes = productos.filter((p) => estadoDe(p) === 'agotado').length;
    setHistorial((h) => {
      const nuevo = h.filter((x) => x.fecha !== hoy);
      nuevo.push({ fecha: hoy, faltantes, inexistentes });
      nuevo.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      return nuevo.slice(-90);
    });
  }, [productos, cargando, setHistorial]);

  const hoy = diasAtras(0);
  const objetivo = diasAtras(DIAS_PERIODO);
  const previos = historial.filter((x) => x.fecha < hoy);
  let ref = null;
  if (previos.length) {
    const hastaObjetivo = previos.filter((x) => x.fecha <= objetivo);
    ref = hastaObjetivo.length ? hastaObjetivo[hastaObjetivo.length - 1] : previos[0];
  }

  const contarPedidos = (desde, hasta) =>
    (ventas || []).filter((x) => x.fecha >= desde && x.fecha <= hasta).length;
  const pedidosActual = contarPedidos(diasAtras(DIAS_PERIODO - 1), diasAtras(0));
  const pedidosAntes = contarPedidos(diasAtras(DIAS_PERIODO * 2 - 1), diasAtras(DIAS_PERIODO));

  const real = {
    hayDatos: pedidosActual + pedidosAntes > 0 || ref !== null,
    pedidos: { actual: pedidosActual, antes: pedidosActual + pedidosAntes > 0 ? pedidosAntes : null },
    faltantes: { actual: productos.filter((p) => estadoDe(p) === 'bajo').length, antes: ref ? ref.faltantes : null },
    inexistentes: { actual: productos.filter((p) => estadoDe(p) === 'agotado').length, antes: ref ? ref.inexistentes : null },
  };

  const ejemplo = forzarEjemplo !== null ? forzarEjemplo : !real.hayDatos;
  const d = ejemplo ? EJEMPLO : real;

  const ramas = [
    { nombre: 'Pedidos', unidad: 'ventas en ' + DIAS_PERIODO + ' días', color: 'var(--viz-violeta)', crecerEsBueno: true, actual: d.pedidos.actual, antes: d.pedidos.antes },
    { nombre: 'Faltantes', unidad: 'productos con stock bajo', color: 'var(--viz-naranja)', crecerEsBueno: false, actual: d.faltantes.actual, antes: d.faltantes.antes },
    { nombre: 'Inexistentes', unidad: 'productos sin stock', color: 'var(--viz-gris)', crecerEsBueno: false, actual: d.inexistentes.actual, antes: d.inexistentes.antes },
  ].map((r) => ({ ...r, indice: indice(r.actual, r.antes), cambio: cambio(r.actual, r.antes) }));

  const claseAviso = ejemplo
    ? 'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--viz-naranja)/40 bg-(--viz-naranja-fondo) px-4 py-2.5 text-sm text-(--viz-naranja-texto)'
    : 'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--borde) bg-(--fondo) px-4 py-2.5 text-sm text-(--texto-suave)';

  return (
    <div className="mt-6 rounded-2xl border border-(--borde) bg-(--superficie) p-4 sm:p-5" aria-labelledby="titulo-crecimiento">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="titulo-crecimiento" className="text-base font-bold text-(--texto)">Índice de crecimiento</h3>
          <p className="mt-0.5 text-sm text-(--texto-suave)">Comparado con el período anterior. <strong className="font-semibold text-(--texto)">100 = sin cambios</strong>.</p>
        </div>
      </div>

      <div className={claseAviso}>
        <p>
          {ejemplo
            ? 'Estás viendo datos de ejemplo. Con tus ventas y el stock de varios días vas a ver tu propio crecimiento.'
            : 'Estás viendo tus datos reales. Las ramas de productos se comparan con la medición de días anteriores.'}
        </p>
        <button
          className="rounded-full border border-current/40 px-4 py-2 text-xs font-semibold cursor-pointer transition hover:bg-(--fondo)"
          type="button"
          onClick={() => setForzarEjemplo(!ejemplo)}
        >
          {ejemplo ? 'Ver mis datos' : 'Ver datos de ejemplo'}
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-10">
        <div className="w-48 shrink-0 sm:w-52 lg:w-56">
          <CrecimientoAnillo ramas={ramas} />
        </div>
        <ul className="w-full max-w-sm divide-y divide-(--borde) sm:w-auto sm:min-w-[19rem]">
          {ramas.map((r) => {
            const c = r.cambio;
            let color = 'text-(--texto-suave)';
            if (!c.sin && c.delta !== 0) {
              const bueno = r.crecerEsBueno ? c.delta > 0 : c.delta < 0;
              color = bueno ? 'text-(--viz-verde-texto)' : 'text-(--viz-naranja-texto)';
            }
            return (
              <li key={r.nombre} className="flex items-center gap-3 py-2.5">
                <span className="size-3.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-(--texto) sm:text-base">{r.nombre}</p>
                  <p className="text-xs leading-snug text-(--texto-suave)">
                    {r.actual + ' ' + r.unidad + (r.antes === null ? '' : ' (antes ' + r.antes + ')')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold leading-none text-(--texto) tabular-nums sm:text-xl">{String(Math.round(r.indice))}</p>
                  <p className={'mt-1 text-xs font-semibold tabular-nums ' + color}>{c.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-(--texto-suave)">Cada porción muestra el peso del índice de esa rama y el número del centro es el promedio. <strong className="font-semibold text-(--texto)">100 = sin cambios</strong> respecto del período anterior; la cifra de color es el cambio. Más pedidos es bueno; más faltantes o inexistentes, no.</p>
    </div>
  );
}
