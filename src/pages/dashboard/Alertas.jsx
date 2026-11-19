import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventario, estadoDe, unidades, ESTADOS } from '../../store/inventario.js';
import { useCatalogo } from '../../store/catalogo.js';
import { useProveedores } from '../../store/proveedores.js';

const CLASES_BOTON = 'inline-flex items-center gap-1.5 rounded-full border border-(--borde) px-3.5 py-2 text-sm font-medium text-(--texto) transition hover:border-(--acento) hover:text-(--acento-hover)';
const CLASES_FILTRO = 'rounded-full border border-(--borde) bg-(--superficie) px-4 py-2 text-sm font-medium text-(--texto) cursor-pointer transition hover:border-(--acento) aria-pressed:border-(--acento-hover) aria-pressed:bg-(--boton) aria-pressed:text-white';
const CLASES_OK = 'mt-4 rounded-lg border border-(--viz-verde)/40 bg-(--viz-verde-fondo) px-4 py-2.5 text-sm text-(--viz-verde-texto)';
const CLASES_ERROR = 'mt-4 rounded-lg border border-(--viz-naranja)/40 bg-(--viz-naranja-fondo) px-4 py-2.5 text-sm text-(--viz-naranja-texto)';

const sugerido = (p) => Math.max(1, p.minimo * 2 - p.stock);

function AlertasTarjeta({ p, catalogo, proveedores, onReponer }) {
  const estado = estadoDe(p);
  const agotado = estado === 'agotado';
  const [cantidad, setCantidad] = useState(String(sugerido(p)));

  // Proveedor del producto: se busca en el catálogo por código/SKU y luego en la lista de proveedores
  const ficha = catalogo.find((c) => String(c.sku).toLowerCase() === String(p.codigo).toLowerCase());
  const nombreProv = ficha && ficha.proveedor ? ficha.proveedor : '';
  const datos = nombreProv
    ? proveedores.find((x) => x.nombre.toLowerCase() === nombreProv.toLowerCase()) || null
    : null;

  const texto = agotado
    ? 'No hay stock y se necesitan mínimo ' + unidades(p.minimo) + '.'
    : (p.stock === 1 ? 'Queda solo 1 unidad' : 'Hay pocos (' + unidades(p.stock) + ')') + ' y se necesitan mínimo ' + unidades(p.minimo) + '.';

  function enviar(e) {
    e.preventDefault();
    onReponer(p, parseInt(cantidad, 10));
  }

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-(--borde) bg-(--superficie) p-4 shadow-[0_2px_8px_rgba(59,42,32,0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-(--texto)">{p.nombre}</p>
          <p className="break-all font-mono text-xs text-(--texto-suave)">{p.codigo}</p>
        </div>
        <span className={'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ' + ESTADOS[estado].clases}>
          {agotado ? 'Sin stock' : 'Stock bajo'}
        </span>
      </div>

      <div>
        <p className="text-sm text-(--texto)">{texto}</p>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-(--fondo) ring-1 ring-(--borde)"
          role="progressbar"
          aria-label={'Stock actual respecto del mínimo de ' + p.nombre}
          aria-valuemin="0"
          aria-valuemax={String(p.minimo)}
          aria-valuenow={String(Math.min(p.stock, p.minimo))}
        >
          <div
            className={'h-full rounded-full ' + (agotado ? 'bg-(--viz-gris)' : 'bg-(--viz-naranja)')}
            style={{ width: (p.minimo > 0 ? Math.min(100, (p.stock / p.minimo) * 100) : 0) + '%' }}
          />
        </div>
        <p className="mt-1 text-xs text-(--texto-suave)">{p.stock + ' de ' + p.minimo + ' unidades mínimas'}</p>
      </div>

      <form className="flex flex-col gap-2 rounded-xl bg-(--fondo) p-3" noValidate onSubmit={enviar}>
        <p className="text-sm font-semibold text-(--texto)">Reponer stock</p>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={'rep-' + p.id}>{'Unidades a reponer de ' + p.nombre}</label>
          <input
            id={'rep-' + p.id}
            className="w-24 rounded-lg border border-(--borde) bg-(--superficie) px-3 py-2.5 text-sm text-(--texto) focus:outline-none focus:border-(--acento) focus:ring-2 focus:ring-(--acento)/30"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-(--boton) px-4 py-2.5 text-sm font-semibold text-white cursor-pointer transition hover:bg-(--boton-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acento-hover)"
            type="submit"
          >
            <i className="fa-solid fa-plus text-[11px]" /> Reponer
          </button>
        </div>
        <p className="text-xs text-(--texto-suave)">{'Sugerido: llevar el stock a ' + unidades(p.stock + sugerido(p)) + ' (el doble del mínimo).'}</p>
      </form>

      <div className="flex flex-col gap-2 border-t border-(--borde) pt-3">
        <p className="text-sm text-(--texto-suave)">
          {nombreProv ? 'Proveedor: ' + nombreProv : 'Este producto no tiene proveedor asignado en el catálogo.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {datos && datos.telefono && (
            <a
              className={CLASES_BOTON}
              href={'tel:' + datos.telefono.replace(/[^\d+]/g, '')}
              aria-label={'Llamar a ' + nombreProv + ' al ' + datos.telefono}
            >
              <i className="fa-solid fa-phone text-[11px]" /> Llamar
            </a>
          )}
          {datos && datos.email && (
            <a
              className={CLASES_BOTON}
              href={
                'mailto:' + datos.email +
                '?subject=' + encodeURIComponent('Pedido de ' + p.nombre) +
                '&body=' + encodeURIComponent('Hola, necesitamos reponer ' + p.nombre + ' (' + p.codigo + '). Stock actual: ' + p.stock + '. Mínimo requerido: ' + p.minimo + '.')
              }
            >
              <i className="fa-regular fa-envelope text-[11px]" /> Escribir
            </a>
          )}
          <Link className={CLASES_BOTON} to="/dashboard/proveedores">
            <i className="fa-solid fa-truck text-[11px]" /> {datos ? 'Ver proveedor' : 'Ir a proveedores'}
          </Link>
          <Link className={CLASES_BOTON} to="/dashboard/inventario">
            <i className="fa-solid fa-boxes-stacked text-[11px]" /> Ver en inventario
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function Alertas() {
  const { productos, cargando, cambiarStock } = useInventario();
  const { catalogo } = useCatalogo();
  const { proveedores } = useProveedores();
  const [filtro, setFiltro] = useState('todas');
  const [mensaje, setMensaje] = useState(null); // { texto, error }

  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const orden = { agotado: 0, bajo: 1 };
  const todas = productos
    .filter((p) => estadoDe(p) !== 'disponible')
    .sort((a, b) => orden[estadoDe(a)] - orden[estadoDe(b)] || a.nombre.localeCompare(b.nombre));
  const nAgotado = todas.filter((p) => estadoDe(p) === 'agotado').length;
  const nBajo = todas.length - nAgotado;
  const visibles = todas.filter((p) => filtro === 'todas' || estadoDe(p) === filtro);

  const subtitulo = todas.length === 0
    ? 'No tenés alertas pendientes.'
    : todas.length + (todas.length === 1 ? ' producto necesita' : ' productos necesitan') + ' atención.';

  async function reponer(p, cantidad) {
    if (!(cantidad >= 1)) {
      setMensaje({ texto: 'Ingresá una cantidad de 1 o más para reponer.', error: true });
      return;
    }
    const antes = estadoDe(p);
    const nuevo = p.stock + cantidad;
    const despues = estadoDe({ ...p, stock: nuevo });
    if (!(await cambiarStock(p.id, nuevo, "Reposición"))) return; // si falló, el cartel de error ya avisó
    setMensaje({
      texto: 'Se agregaron ' + unidades(cantidad) + ' a ' + p.nombre + ' (ahora ' + unidades(nuevo) + ')' +
        (despues === 'disponible' ? '. La alerta se resolvió.' : (antes === 'agotado' ? '. Ya no está sin stock, pero sigue bajo el mínimo.' : '. Sigue bajo el mínimo.')),
      error: false,
    });
  }

  const filtros = [
    ['todas', 'Todas', todas.length],
    ['agotado', 'Sin stock', nAgotado],
    ['bajo', 'Stock bajo', nBajo],
  ];

  return (
    <section id="alertas" className="mx-auto max-w-5xl" aria-labelledby="titulo-alertas-pagina">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-alertas-pagina" className="text-xl font-bold text-(--texto)">Alertas de stock</h2>
          <p className="mt-0.5 text-sm text-(--texto-suave)">{subtitulo}</p>
        </div>
        <Link className="inline-flex items-center gap-2 rounded-full border border-(--borde) bg-(--superficie) px-4 py-2 text-sm font-medium text-(--texto) transition hover:border-(--acento) hover:text-(--acento-hover)" to="/dashboard/inventario"><i className="fa-solid fa-boxes-stacked text-xs" /> Ver inventario</Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar alertas">
        {filtros.map(([clave, texto, n]) => (
          <button key={clave} className={CLASES_FILTRO} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
            {texto} <span className="ml-1 opacity-80">{n}</span>
          </button>
        ))}
      </div>

      {mensaje && (
        <p className={mensaje.error ? CLASES_ERROR : CLASES_OK} role="status">{mensaje.texto}</p>
      )}

      {visibles.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
          {visibles.map((p) => (
            <AlertasTarjeta key={p.id + '-' + p.stock} p={p} catalogo={catalogo || []} proveedores={proveedores || []} onReponer={reponer} />
          ))}
        </ul>
      )}

      {!cargando && visibles.length === 0 && (
        <div className="mt-4 rounded-2xl border border-(--borde) bg-(--superficie) px-6 py-12 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-(--viz-verde-fondo) text-xl text-(--viz-verde-texto)" aria-hidden="true"><i className="fa-regular fa-circle-check" /></span>
          <p className="mt-4 text-lg font-bold text-(--texto)">Todo en orden</p>
          <p className="mt-1 text-sm text-(--texto-suave)">
            {todas.length === 0 ? 'No hay productos con stock bajo ni agotados.' : 'No hay alertas en esta categoría.'}
          </p>
        </div>
      )}
    </section>
  );
}
