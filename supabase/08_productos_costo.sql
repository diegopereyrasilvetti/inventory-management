-- =====================================================================
-- Gestión de Stock - Impuestos, fase 2: costo e IVA de cada producto
-- Se pega y ejecuta una sola vez en Supabase > SQL Editor, DESPUÉS de 01 a 07.
-- Es seguro correrlo de nuevo. NO borra ni modifica ningún dato existente:
-- solo agrega columnas VACÍAS a productos y una tabla nueva de historial.
--
-- Cada producto puede tener:
--   alicuota_iva   % de IVA propio. Vacío = usa la alícuota general de la configuración fiscal.
--   costo_con_iva  costo de compra por unidad, con IVA incluido, tal como se cargó.
--   costo          costo "comparable" por unidad: es la base del costo promedio ponderado.
--                  (Responsable Inscripto: sin IVA, porque se recupera; Monotributo/Exento: con IVA.)
-- Costo vacío = costo DESCONOCIDO. Nunca se interpreta como cero.
--
-- Cada cambio de costo o de IVA queda en un historial (quién, cuándo, valor anterior y nuevo).
-- Los permisos de productos no cambian: quien ya puede editar productos puede cargar su costo.
-- =====================================================================

-- ---------- Columnas nuevas (vacías para los productos que ya existen) ----------
alter table public.productos
  add column if not exists alicuota_iva  numeric(5,2)  check (alicuota_iva between 0 and 100),
  add column if not exists costo_con_iva numeric(14,4) check (costo_con_iva >= 0),
  add column if not exists costo         numeric(14,4) check (costo >= 0);

-- Un producto no puede tener "medio costo": o se conocen los dos valores o ninguno
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_costo_completo' and conrelid = 'public.productos'::regclass) then
    alter table public.productos
      add constraint productos_costo_completo check ((costo is null) = (costo_con_iva is null));
  end if;
end $$;

-- ---------- Historial de costos ----------
create table if not exists public.productos_costos_historial (
  id                   bigint generated always as identity primary key,
  cambiado_en          timestamptz not null default now(),
  cambiado_por         uuid references auth.users(id) on delete set null,
  producto_id          bigint references public.productos(id) on delete set null,
  sku                  text,
  nombre               text,
  motivo               text not null,
  costo_con_iva_antes  numeric(14,4),
  costo_con_iva_despues numeric(14,4),
  costo_antes          numeric(14,4),
  costo_despues        numeric(14,4),
  alicuota_antes       numeric(5,2),
  alicuota_despues     numeric(5,2)
);

create index if not exists productos_costos_historial_producto_idx on public.productos_costos_historial (producto_id);

-- Lo escribe la base (no las personas), por eso corre con permisos propios.
-- No interviene cuando solo cambia el stock, el precio u otros datos.
create or replace function public.productos_registrar_costo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.costo_con_iva is null and new.alicuota_iva is null then
      return new;
    end if;
    insert into public.productos_costos_historial
      (cambiado_por, producto_id, sku, nombre, motivo,
       costo_con_iva_despues, costo_despues, alicuota_despues)
    values
      (auth.uid(), new.id, new.sku, new.nombre, 'Alta del producto',
       new.costo_con_iva, new.costo, new.alicuota_iva);
  else
    if new.costo_con_iva is not distinct from old.costo_con_iva
       and new.costo is not distinct from old.costo
       and new.alicuota_iva is not distinct from old.alicuota_iva then
      return new;
    end if;
    insert into public.productos_costos_historial
      (cambiado_por, producto_id, sku, nombre, motivo,
       costo_con_iva_antes, costo_con_iva_despues, costo_antes, costo_despues,
       alicuota_antes, alicuota_despues)
    values
      (auth.uid(), new.id, new.sku, new.nombre,
       case when old.costo_con_iva is null then 'Costo inicial' else 'Cambio de costo o IVA' end,
       old.costo_con_iva, new.costo_con_iva, old.costo, new.costo,
       old.alicuota_iva, new.alicuota_iva);
  end if;
  return new;
end;
$$;

drop trigger if exists productos_costo_historial on public.productos;
create trigger productos_costo_historial
  after insert or update of costo, costo_con_iva, alicuota_iva on public.productos
  for each row execute function public.productos_registrar_costo();

-- ---------- Seguridad (RLS) ----------
alter table public.productos_costos_historial enable row level security;

drop policy if exists "productos_costos_historial: ver" on public.productos_costos_historial;
create policy "productos_costos_historial: ver" on public.productos_costos_historial
  for select to authenticated using (public.es_miembro());

-- Sin políticas de insert/update/delete: el historial no se puede tocar desde la web.
revoke all on public.productos_costos_historial from anon, authenticated;
grant select on public.productos_costos_historial to authenticated;
