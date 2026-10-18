-- =====================================================================
-- Gestión de Stock - Impuestos, fase 4: módulo de Compras
-- Se pega y ejecuta una sola vez en Supabase > SQL Editor, DESPUÉS de 01 a 09.
-- Es seguro correrlo de nuevo. NO borra ni modifica ningún dato existente:
-- crea tablas nuevas y funciones nuevas, y reemplaza solo el texto del historial de costos (ver abajo).
--
-- Una COMPRA es el comprobante de lo que se le compra a un proveedor. Al registrarla, TODO en un solo paso
-- (si algo falla no queda nada a medias):
--   - suma el stock de cada producto y anota el movimiento "Compra #N"
--   - actualiza el costo del producto con el COSTO PROMEDIO PONDERADO
--       (stock actual x costo actual + cantidad nueva x costo nuevo) / (stock actual + cantidad nueva)
--       Si el producto tenía stock pero su costo se desconocía, el costo SIGUE desconocido (no se inventa).
--   - separa neto, IVA y crédito fiscal según la condición fiscal y el tipo de comprobante:
--       Responsable Inscripto + Factura A: el IVA es crédito fiscal y el costo es el neto
--       cualquier otro caso: no hay crédito, el IVA forma parte del costo
--   - guarda "la foto" de cada renglón (stock y costo de antes y de después), para poder revertir
--   - una compra NO es un gasto: entra al stock y se convierte en costo recién cuando se vende
--
-- Pagos: una compra se paga al registrarla o queda "a pagar"; después se registran pagos parciales o totales.
--   Cada pago se registra una sola vez. Los pagos nunca superan el saldo.
--
-- Anular (las compras y los pagos NO se borran: se anulan con un motivo y queda la huella):
--   Solo se puede anular la ÚLTIMA compra de cada producto, si todavía hay stock suficiente
--   (no se vendió lo comprado) y si el costo no se tocó a mano después. Se restaura el costo anterior.
--
-- Seguridad: la web solo puede LEER estas tablas. Todo cambio pasa por las funciones de abajo, que
-- verifican que la persona sea miembro activo. Nadie puede editar un total ni un renglón por afuera.
-- =====================================================================

-- ---------- Requisitos: tienen que estar ejecutados 07 y 08 ----------
do $$
begin
  if to_regclass('public.configuracion_fiscal') is null then
    raise exception 'Falta ejecutar antes 07_configuracion_fiscal.sql. No se cambió nada.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name = 'costo'
  ) then
    raise exception 'Falta ejecutar antes 08_productos_costo.sql. No se cambió nada.';
  end if;
end $$;

-- ---------- Tablas ----------
create table if not exists public.compras (
  id                 bigint generated always as identity primary key,
  user_id            uuid default auth.uid() references auth.users (id) on delete set null,
  fecha              date not null default current_date,
  proveedor_id       bigint references public.proveedores (id) on delete set null,
  proveedor_nombre   text,
  tipo_comprobante   text not null check (tipo_comprobante in ('factura_a', 'factura_b', 'factura_c', 'ticket', 'sin_comprobante')),
  numero_comprobante text,
  notas              text,
  condicion_fiscal   text not null check (condicion_fiscal in ('responsable_inscripto', 'monotributista', 'exento')),
  total              numeric(14,2) not null default 0 check (total >= 0),
  neto               numeric(14,2) not null default 0 check (neto >= 0),
  iva                numeric(14,2) not null default 0 check (iva >= 0),
  credito_fiscal     numeric(14,2) not null default 0 check (credito_fiscal >= 0),
  estado             text not null default 'activa' check (estado in ('activa', 'anulada')),
  anulada_en         timestamptz,
  anulada_por        uuid references auth.users (id) on delete set null,
  motivo_anulacion   text,
  created_at         timestamptz not null default now(),
  check ((estado = 'anulada') = (anulada_en is not null))
);

create table if not exists public.compra_items (
  id                     bigint generated always as identity primary key,
  compra_id              bigint not null references public.compras (id) on delete cascade,
  producto_id            bigint references public.productos (id) on delete set null,
  sku                    text not null,
  nombre                 text not null,
  cantidad               integer not null check (cantidad > 0),
  costo_unitario_con_iva numeric(14,4) not null check (costo_unitario_con_iva >= 0),
  alicuota_iva           numeric(5,2) not null check (alicuota_iva between 0 and 100),
  total                  numeric(14,2) not null check (total >= 0),
  neto                   numeric(14,2) not null check (neto >= 0),
  iva                    numeric(14,2) not null check (iva >= 0),
  credito_fiscal         numeric(14,2) not null check (credito_fiscal >= 0),
  costo_unitario         numeric(14,4) not null check (costo_unitario >= 0),
  stock_antes            integer not null,
  costo_antes            numeric(14,4),
  costo_con_iva_antes    numeric(14,4),
  stock_despues          integer not null,
  costo_despues          numeric(14,4),
  costo_con_iva_despues  numeric(14,4)
);

create table if not exists public.compra_pagos (
  id               bigint generated always as identity primary key,
  user_id          uuid default auth.uid() references auth.users (id) on delete set null,
  compra_id        bigint not null references public.compras (id) on delete cascade,
  fecha            date not null default current_date,
  metodo           text not null check (metodo in ('Efectivo', 'Transferencia', 'Tarjeta')),
  monto            numeric(14,2) not null check (monto > 0),
  estado           text not null default 'activo' check (estado in ('activo', 'anulado')),
  anulado_en       timestamptz,
  anulado_por      uuid references auth.users (id) on delete set null,
  motivo_anulacion text,
  created_at       timestamptz not null default now(),
  check ((estado = 'anulado') = (anulado_en is not null))
);

create index if not exists compras_fecha_idx        on public.compras (fecha);
create index if not exists compras_proveedor_idx    on public.compras (proveedor_id);
create index if not exists compra_items_compra_idx  on public.compra_items (compra_id);
create index if not exists compra_items_producto_idx on public.compra_items (producto_id);
create index if not exists compra_pagos_compra_idx  on public.compra_pagos (compra_id);

-- ---------- Historial de costos: ahora dice de qué compra viene el cambio ----------
-- (misma función de 08; solo agrega que, si hay un motivo indicado por la operación, se usa ese texto)
create or replace function public.productos_registrar_costo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := nullif(current_setting('gestion.motivo_costo', true), '');
begin
  if tg_op = 'INSERT' then
    if new.costo_con_iva is null and new.alicuota_iva is null then
      return new;
    end if;
    insert into public.productos_costos_historial
      (cambiado_por, producto_id, sku, nombre, motivo,
       costo_con_iva_despues, costo_despues, alicuota_despues)
    values
      (auth.uid(), new.id, new.sku, new.nombre, coalesce(v_motivo, 'Alta del producto'),
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
       coalesce(v_motivo, case when old.costo_con_iva is null then 'Costo inicial' else 'Cambio de costo o IVA' end),
       old.costo_con_iva, new.costo_con_iva, old.costo, new.costo,
       old.alicuota_iva, new.alicuota_iva);
  end if;
  return new;
end;
$$;

-- ---------- 1) Registrar una compra ----------
-- p_items: [{"producto_id": 1, "cantidad": 10, "costo_unitario_con_iva": 1210, "alicuota_iva": 21 (opcional)}, ...]
-- p_pago:  {"metodo": "Efectivo", "monto": 5000 (opcional: si falta se paga todo), "fecha": "2026-10-18" (opcional)}
--          o null si la compra queda "a pagar" (en ese caso el proveedor es obligatorio)
create or replace function public.registrar_compra(
  p_fecha date, p_proveedor bigint, p_tipo text, p_numero text, p_notas text, p_items jsonb, p_pago jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_compra bigint;
  v_cond text;
  v_general numeric(5, 2);
  v_prov_nombre text;
  v_credito_posible boolean;
  v_total numeric(14, 2) := 0;
  v_neto_t numeric(14, 2) := 0;
  v_iva_t numeric(14, 2) := 0;
  v_cred_t numeric(14, 2) := 0;
  r record;
  p public.productos;
  v_unit numeric(14, 4);
  v_alic numeric(5, 2);
  v_total_l numeric(14, 2);
  v_neto_l numeric(14, 2);
  v_iva_l numeric(14, 2);
  v_cred_l numeric(14, 2);
  v_comp numeric(14, 4);
  v_nuevo_costo numeric(14, 4);
  v_nuevo_con_iva numeric(14, 4);
  v_metodo text;
  v_monto numeric(14, 2);
  v_fecha_pago date;
begin
  if not public.es_miembro() then
    raise exception 'No tenés permiso para esa acción.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra necesita al menos un producto.' using errcode = 'GS001';
  end if;
  if p_tipo is null or p_tipo not in ('factura_a', 'factura_b', 'factura_c', 'ticket', 'sin_comprobante') then
    raise exception 'El tipo de comprobante no es válido.' using errcode = 'GS001';
  end if;
  if v_fecha > current_date + 1 then
    raise exception 'La fecha de la compra no puede ser futura.' using errcode = 'GS001';
  end if;

  select condicion_fiscal, alicuota_iva_general into v_cond, v_general
  from public.configuracion_fiscal where id = 1;
  if v_cond is null then
    raise exception 'Falta la configuración fiscal: sin ella no se puede calcular el IVA de la compra.' using errcode = 'GS001';
  end if;
  v_credito_posible := (v_cond = 'responsable_inscripto' and p_tipo = 'factura_a');

  if p_proveedor is not null then
    select nombre into v_prov_nombre from public.proveedores where id = p_proveedor;
    if not found then
      raise exception 'Proveedor no encontrado.' using errcode = 'GS002';
    end if;
  end if;

  -- Pago
  if p_pago is null or jsonb_typeof(p_pago) = 'null' then
    if p_proveedor is null then
      raise exception 'Para dejar una compra a pagar hay que elegir el proveedor.' using errcode = 'GS001';
    end if;
  else
    v_metodo := p_pago ->> 'metodo';
    if v_metodo is null or v_metodo not in ('Efectivo', 'Transferencia', 'Tarjeta') then
      raise exception 'El método de pago no es válido.' using errcode = 'GS001';
    end if;
  end if;

  -- Se bloquean TODOS los productos de la compra, siempre en el mismo orden (evita bloqueos cruzados con otras operaciones)
  perform 1 from public.productos
  where id in (select (i ->> 'producto_id')::bigint from jsonb_array_elements(p_items) as i)
  order by id for update;
  if (select count(*) from public.productos where id in (select (i ->> 'producto_id')::bigint from jsonb_array_elements(p_items) as i))
     <> (select count(distinct (i ->> 'producto_id')::bigint) from jsonb_array_elements(p_items) as i) then
    raise exception 'Producto no encontrado.' using errcode = 'GS002';
  end if;

  insert into public.compras (fecha, proveedor_id, proveedor_nombre, tipo_comprobante, numero_comprobante, notas, condicion_fiscal)
  values (v_fecha, p_proveedor, v_prov_nombre, p_tipo, nullif(trim(p_numero), ''), nullif(trim(p_notas), ''), v_cond)
  returning id into v_compra;

  perform set_config('gestion.motivo_costo', 'Compra #' || v_compra, true);

  -- Cada renglón se aplica en el orden en que llegó (el costo promedio se va actualizando renglón a renglón)
  for r in
    select (i ->> 'producto_id')::bigint as producto_id,
           (i ->> 'cantidad')::integer as cantidad,
           (i ->> 'costo_unitario_con_iva')::numeric as costo,
           nullif(i ->> 'alicuota_iva', '')::numeric as alicuota,
           n
    from jsonb_array_elements(p_items) with ordinality as t(i, n)
    order by n
  loop
    if r.producto_id is null or r.cantidad is null or r.cantidad < 1 then
      raise exception 'Cada producto necesita una cantidad de 1 o más.' using errcode = 'GS001';
    end if;
    if r.costo is null or r.costo < 0 then
      raise exception 'Cada producto necesita un costo de 0 en adelante.' using errcode = 'GS001';
    end if;
    if r.alicuota is not null and (r.alicuota < 0 or r.alicuota > 100) then
      raise exception 'La alícuota de IVA tiene que estar entre 0 y 100.' using errcode = 'GS001';
    end if;

    select * into p from public.productos where id = r.producto_id; -- ya bloqueado arriba

    v_unit := round(r.costo, 4);
    v_alic := case when v_cond = 'responsable_inscripto' then coalesce(r.alicuota, p.alicuota_iva, v_general) else 0 end;
    v_total_l := round(r.cantidad * v_unit, 2);
    v_neto_l := case when v_alic > 0 then round(v_total_l / (1 + v_alic / 100), 2) else v_total_l end;
    v_iva_l := v_total_l - v_neto_l;
    v_cred_l := case when v_credito_posible then v_iva_l else 0 end;

    -- Costo "comparable": sin IVA si el IVA se recupera, con IVA si no (así todos los costos se promedian en la misma base)
    v_comp := round(case when v_credito_posible and v_alic > 0 then v_unit / (1 + v_alic / 100) else v_unit end, 4);

    if p.stock <= 0 then
      v_nuevo_costo := v_comp;
      v_nuevo_con_iva := v_unit;
    elsif p.costo is null or p.costo_con_iva is null then
      v_nuevo_costo := null;        -- hay stock con costo desconocido: no se puede promediar con honestidad
      v_nuevo_con_iva := null;
    else
      v_nuevo_costo := round((p.stock * p.costo + r.cantidad * v_comp) / (p.stock + r.cantidad), 4);
      v_nuevo_con_iva := round((p.stock * p.costo_con_iva + r.cantidad * v_unit) / (p.stock + r.cantidad), 4);
    end if;

    insert into public.compra_items
      (compra_id, producto_id, sku, nombre, cantidad, costo_unitario_con_iva, alicuota_iva, total, neto, iva, credito_fiscal,
       costo_unitario, stock_antes, costo_antes, costo_con_iva_antes, stock_despues, costo_despues, costo_con_iva_despues)
    values
      (v_compra, p.id, p.sku, p.nombre, r.cantidad, v_unit, v_alic, v_total_l, v_neto_l, v_iva_l, v_cred_l,
       v_comp, p.stock, p.costo, p.costo_con_iva, p.stock + r.cantidad, v_nuevo_costo, v_nuevo_con_iva);

    update public.productos
    set stock = stock + r.cantidad, costo = v_nuevo_costo, costo_con_iva = v_nuevo_con_iva
    where id = p.id;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo)
    values (p.id, 'entrada', r.cantidad, 'Compra #' || v_compra);

    v_total := v_total + v_total_l;
    v_neto_t := v_neto_t + v_neto_l;
    v_iva_t := v_iva_t + v_iva_l;
    v_cred_t := v_cred_t + v_cred_l;
  end loop;

  update public.compras
  set total = v_total, neto = v_neto_t, iva = v_iva_t, credito_fiscal = v_cred_t
  where id = v_compra;

  if v_metodo is not null then
    v_monto := coalesce(nullif(p_pago ->> 'monto', '')::numeric, v_total);
    v_fecha_pago := coalesce(nullif(p_pago ->> 'fecha', '')::date, v_fecha);
    if v_monto <= 0 or v_monto > v_total then
      raise exception 'El pago tiene que ser mayor a 0 y no superar el total de la compra.' using errcode = 'GS001';
    end if;
    if v_fecha_pago < v_fecha then
      raise exception 'El pago no puede ser anterior a la compra.' using errcode = 'GS001';
    end if;
    insert into public.compra_pagos (compra_id, fecha, metodo, monto) values (v_compra, v_fecha_pago, v_metodo, v_monto);
  end if;

  return v_compra;
end;
$$;

-- ---------- 2) Registrar un pago de una compra ----------
create or replace function public.registrar_pago_compra(p_compra bigint, p_fecha date, p_metodo text, p_monto numeric)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.compras;
  v_saldo numeric(14, 2);
  v_pago bigint;
  v_fecha date := coalesce(p_fecha, current_date);
begin
  if not public.es_miembro() then
    raise exception 'No tenés permiso para esa acción.' using errcode = '42501';
  end if;
  select * into c from public.compras where id = p_compra for update;
  if not found then
    raise exception 'Compra no encontrada.' using errcode = 'GS002';
  end if;
  if c.estado <> 'activa' then
    raise exception 'La compra está anulada: no admite pagos.' using errcode = 'GS001';
  end if;
  if p_metodo is null or p_metodo not in ('Efectivo', 'Transferencia', 'Tarjeta') then
    raise exception 'El método de pago no es válido.' using errcode = 'GS001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago tiene que ser mayor a 0.' using errcode = 'GS001';
  end if;
  if v_fecha < c.fecha then
    raise exception 'El pago no puede ser anterior a la compra.' using errcode = 'GS001';
  end if;
  if v_fecha > current_date + 1 then
    raise exception 'La fecha del pago no puede ser futura.' using errcode = 'GS001';
  end if;

  v_saldo := c.total - coalesce((select sum(monto) from public.compra_pagos where compra_id = c.id and estado = 'activo'), 0);
  if round(p_monto, 2) > v_saldo then
    raise exception 'El pago supera el saldo pendiente (%).', v_saldo using errcode = 'GS001';
  end if;

  insert into public.compra_pagos (compra_id, fecha, metodo, monto)
  values (c.id, v_fecha, p_metodo, round(p_monto, 2))
  returning id into v_pago;
  return v_pago;
end;
$$;

-- ---------- 3) Anular un pago ----------
create or replace function public.anular_pago_compra(p_pago bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra bigint;
  pg public.compra_pagos;
begin
  if not public.es_miembro() then
    raise exception 'No tenés permiso para esa acción.' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Escribí el motivo de la anulación.' using errcode = 'GS001';
  end if;
  select compra_id into v_compra from public.compra_pagos where id = p_pago;
  if not found then
    raise exception 'Pago no encontrado.' using errcode = 'GS002';
  end if;
  perform 1 from public.compras where id = v_compra for update; -- siempre primero la compra, después el pago
  select * into pg from public.compra_pagos where id = p_pago for update;
  if pg.estado <> 'activo' then
    raise exception 'Ese pago ya está anulado.' using errcode = 'GS001';
  end if;
  update public.compra_pagos
  set estado = 'anulado', anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo)
  where id = p_pago;
end;
$$;

-- ---------- 4) Anular una compra ----------
create or replace function public.anular_compra(p_compra bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.compras;
  r record;
  p public.productos;
  v_post bigint;
  v_ult public.compra_items;
  v_pri public.compra_items;
begin
  if not public.es_miembro() then
    raise exception 'No tenés permiso para esa acción.' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Escribí el motivo de la anulación.' using errcode = 'GS001';
  end if;
  select * into c from public.compras where id = p_compra for update;
  if not found then
    raise exception 'Compra no encontrada.' using errcode = 'GS002';
  end if;
  if c.estado <> 'activa' then
    raise exception 'Esa compra ya está anulada.' using errcode = 'GS001';
  end if;
  if exists (select 1 from public.compra_items where compra_id = c.id and producto_id is null) then
    raise exception 'No se puede anular: un producto de esta compra ya fue eliminado del catálogo.' using errcode = 'GS001';
  end if;

  perform 1 from public.productos
  where id in (select producto_id from public.compra_items where compra_id = c.id)
  order by id for update;

  perform set_config('gestion.motivo_costo', 'Anulación de la compra #' || c.id, true);

  for r in
    select producto_id, sum(cantidad)::integer as cant, min(id) as primer_item, max(id) as ultimo_item
    from public.compra_items where compra_id = c.id
    group by producto_id order by producto_id
  loop
    select * into p from public.productos where id = r.producto_id;

    select ci.compra_id into v_post
    from public.compra_items ci join public.compras c2 on c2.id = ci.compra_id
    where ci.producto_id = r.producto_id and c2.estado = 'activa' and c2.id > c.id
    order by c2.id limit 1;
    if found then
      raise exception 'No se puede anular: "%" tuvo una compra posterior (#%). Anulá primero esa compra.', p.nombre, v_post
        using errcode = 'GS001';
    end if;

    if p.stock < r.cant then
      raise exception 'No se puede anular: de "%" ya se vendió o se sacó parte de lo comprado (stock actual %, comprados %).', p.nombre, p.stock, r.cant
        using errcode = 'GS001';
    end if;

    select * into v_ult from public.compra_items where id = r.ultimo_item;
    if p.costo is distinct from v_ult.costo_despues or p.costo_con_iva is distinct from v_ult.costo_con_iva_despues then
      raise exception 'No se puede anular: el costo de "%" se modificó a mano después de esta compra.', p.nombre using errcode = 'GS001';
    end if;

    select * into v_pri from public.compra_items where id = r.primer_item;

    update public.productos
    set stock = stock - r.cant, costo = v_pri.costo_antes, costo_con_iva = v_pri.costo_con_iva_antes
    where id = r.producto_id;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo)
    values (r.producto_id, 'salida', -r.cant, 'Compra #' || c.id || ' anulada');
  end loop;

  update public.compra_pagos
  set estado = 'anulado', anulado_en = now(), anulado_por = auth.uid(),
      motivo_anulacion = 'Se anuló la compra #' || c.id
  where compra_id = c.id and estado = 'activo';

  update public.compras
  set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = trim(p_motivo)
  where id = c.id;
end;
$$;

-- ---------- Seguridad (RLS): la web solo lee ----------
alter table public.compras      enable row level security;
alter table public.compra_items enable row level security;
alter table public.compra_pagos enable row level security;

drop policy if exists "compras: ver" on public.compras;
create policy "compras: ver" on public.compras for select to authenticated using (public.es_miembro());
drop policy if exists "compra_items: ver" on public.compra_items;
create policy "compra_items: ver" on public.compra_items for select to authenticated using (public.es_miembro());
drop policy if exists "compra_pagos: ver" on public.compra_pagos;
create policy "compra_pagos: ver" on public.compra_pagos for select to authenticated using (public.es_miembro());

revoke all on public.compras, public.compra_items, public.compra_pagos from anon, authenticated;
grant select on public.compras, public.compra_items, public.compra_pagos to authenticated;

revoke all on function public.registrar_compra(date, bigint, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.registrar_pago_compra(bigint, date, text, numeric) from public, anon;
revoke all on function public.anular_pago_compra(bigint, text) from public, anon;
revoke all on function public.anular_compra(bigint, text) from public, anon;
grant execute on function public.registrar_compra(date, bigint, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.registrar_pago_compra(bigint, date, text, numeric) to authenticated;
grant execute on function public.anular_pago_compra(bigint, text) to authenticated;
grant execute on function public.anular_compra(bigint, text) to authenticated;
