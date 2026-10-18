-- =====================================================================
-- Gestión de Stock - Impuestos, fase 3: desglose de IVA y costo histórico en cada venta
-- Se pega y ejecuta una sola vez en Supabase > SQL Editor, DESPUÉS de 01 a 08.
-- Es seguro correrlo de nuevo. NO borra ni modifica ninguna venta existente:
-- agrega columnas VACÍAS y reemplaza la función registrar_venta (misma firma, misma forma de usarla).
--
-- Desde ahora, cada venta nueva guarda "una foto" de lo que pasaba en ese momento:
--   En cada renglón: alícuota de IVA, neto, IVA y costo unitario del producto.
--   En la venta:     condición fiscal, neto total e IVA total.
-- Así el historial NO cambia si después modificás el costo, el precio, el IVA del producto
-- o la configuración fiscal.
--
-- Reglas:
--   - El precio cargado es el precio final (IVA incluido). El neto y el IVA se calculan de ahí:
--       Responsable Inscripto: alícuota del producto (o la general si no tiene) -> neto = total / (1 + alícuota)
--       Monotributista / Exento: no se discrimina IVA -> todo el total es ingreso, IVA = 0
--   - Costo desconocido (producto sin costo cargado) queda VACÍO en el renglón. Nunca se guarda como 0.
--   - Las ventas anteriores a este script quedan sin desglose (vacías): se muestran como siempre.
--   - Si no existiera la configuración fiscal, la venta se registra igual que antes, sin desglose.
--   - Eliminar una venta sigue devolviendo el stock; se lleva consigo su desglose.
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

-- ---------- Columnas nuevas (vacías para lo que ya existe) ----------
alter table public.ventas
  add column if not exists condicion_fiscal text
    check (condicion_fiscal in ('responsable_inscripto', 'monotributista', 'exento')),
  add column if not exists neto numeric(14,2) check (neto >= 0),
  add column if not exists iva  numeric(14,2) check (iva >= 0);

alter table public.venta_items
  add column if not exists alicuota_iva   numeric(5,2)  check (alicuota_iva between 0 and 100),
  add column if not exists neto           numeric(14,2) check (neto >= 0),
  add column if not exists iva            numeric(14,2) check (iva >= 0),
  add column if not exists costo_unitario numeric(14,4) check (costo_unitario >= 0);

-- El desglose está completo o no existe (no hay "medio desglose")
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_desglose_completo' and conrelid = 'public.ventas'::regclass) then
    alter table public.ventas
      add constraint ventas_desglose_completo
      check ((condicion_fiscal is null) = (neto is null) and (neto is null) = (iva is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venta_items_desglose_completo' and conrelid = 'public.venta_items'::regclass) then
    alter table public.venta_items
      add constraint venta_items_desglose_completo
      check ((neto is null) = (iva is null) and (neto is null) = (alicuota_iva is null));
  end if;
end $$;

-- ---------- Registrar una venta (misma firma que antes) ----------
-- p_items: [{"producto_id": 1, "cantidad": 2}, ...]
-- El precio, el nombre, el IVA y el costo se toman de la base (no del navegador).
create or replace function public.registrar_venta(p_fecha date, p_metodo text, p_items jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta bigint;
  v_total numeric(12, 2) := 0;
  v_neto_total numeric(14, 2) := 0;
  v_iva_total numeric(14, 2) := 0;
  v_cond text;
  v_general numeric(5, 2);
  v_alic numeric(5, 2);
  v_linea numeric(14, 2);
  v_neto numeric(14, 2);
  v_iva numeric(14, 2);
  r record;
  p public.productos;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta necesita al menos un producto.' using errcode = 'GS001';
  end if;

  -- Condición fiscal vigente en este momento (si no hay configuración, v_cond queda vacía: sin desglose)
  select condicion_fiscal, alicuota_iva_general into v_cond, v_general
  from public.configuracion_fiscal where id = 1;

  insert into public.ventas (fecha, metodo, total)
  values (coalesce(p_fecha, current_date), p_metodo, 0)
  returning id into v_venta;

  -- Si el mismo producto viene dos veces se suman; "order by" evita bloqueos cruzados entre ventas
  for r in
    select (i ->> 'producto_id')::bigint as producto_id, sum((i ->> 'cantidad')::integer) as cantidad
    from jsonb_array_elements(p_items) as i
    group by 1
    order by 1
  loop
    if r.producto_id is null or r.cantidad is null or r.cantidad < 1 then
      raise exception 'Cada producto necesita una cantidad de 1 o más.' using errcode = 'GS001';
    end if;

    select * into p from public.productos where id = r.producto_id for update;
    if not found then
      raise exception 'Producto no encontrado.' using errcode = 'GS002';
    end if;
    if p.precio is null then
      raise exception 'El producto "%" no tiene precio cargado.', p.nombre using errcode = 'GS001';
    end if;
    if p.stock < r.cantidad then
      raise exception 'Stock insuficiente de "%": quedan % y querés vender %.', p.nombre, p.stock, r.cantidad
        using errcode = 'GS003';
    end if;

    v_linea := p.precio * r.cantidad;

    -- Desglose del IVA (el precio ya lo incluye)
    if v_cond is not null then
      v_alic := case when v_cond = 'responsable_inscripto' then coalesce(p.alicuota_iva, v_general) else 0 end;
      v_neto := case when v_alic > 0 then round(v_linea / (1 + v_alic / 100), 2) else v_linea end;
      v_iva := v_linea - v_neto;
      v_neto_total := v_neto_total + v_neto;
      v_iva_total := v_iva_total + v_iva;
    else
      v_alic := null;
      v_neto := null;
      v_iva := null;
    end if;

    -- costo_unitario: el costo del producto en este momento (vacío si se desconoce)
    insert into public.venta_items (venta_id, producto_id, sku, nombre, precio, cantidad, alicuota_iva, neto, iva, costo_unitario)
    values (v_venta, p.id, p.sku, p.nombre, p.precio, r.cantidad, v_alic, v_neto, v_iva, p.costo);

    update public.productos set stock = stock - r.cantidad where id = p.id;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo)
    values (p.id, 'venta', -r.cantidad, 'Venta #' || v_venta);

    v_total := v_total + v_linea;
  end loop;

  update public.ventas
  set total = v_total,
      condicion_fiscal = v_cond,
      neto = case when v_cond is null then null else v_neto_total end,
      iva = case when v_cond is null then null else v_iva_total end
  where id = v_venta;

  return v_venta;
end;
$$;

-- ---------- Permisos (igual que antes: solo usuarios con sesión) ----------
revoke all on function public.registrar_venta(date, text, jsonb) from public, anon;
grant execute on function public.registrar_venta(date, text, jsonb) to authenticated;
