-- =====================================================================
-- Gestión de Stock - Ventas con "Sin IVA discriminado"
-- Se pega y ejecuta una sola vez en Supabase > SQL Editor, DESPUÉS de 01 a 10 (necesita la 09).
-- Es seguro correrlo de nuevo. NO borra ni modifica ninguna venta existente:
-- agrega una columna (todas las ventas existentes quedan en "no") y actualiza registrar_venta.
--
-- Qué agrega: al registrar una venta se puede indicar "sin IVA discriminado" (solo para Responsable Inscripto).
--   - La venta se registra COMPLETA: el total cobrado, el stock, el costo y la ganancia no cambian.
--   - No se separa el IVA: neto = total, IVA = 0, alícuota 0 en cada renglón.
--   - La venta queda MARCADA (ventas.sin_iva = true) para que se vea en la lista y se pueda sumar aparte.
--   - Para Monotributista y Exento no hace falta (el IVA ya no se discrimina): la marca se ignora.
--
-- Es una herramienta de registro interno; la situación fiscal correcta de cada venta se define con el contador.
--
-- registrar_venta: misma forma de uso que antes, con un parámetro opcional al final (p_sin_iva, por defecto false).
-- La versión anterior (3 parámetros) se reemplaza por esta: no pueden convivir las dos, porque el servidor
-- no sabría cuál elegir.
-- =====================================================================

-- ---------- Requisito: tiene que estar ejecutada la 09 ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ventas' and column_name = 'neto'
  ) then
    raise exception 'Falta ejecutar antes 09_ventas_desglose.sql. No se cambió nada.';
  end if;
end $$;

-- ---------- Columna nueva (todas las ventas existentes quedan en "no") ----------
alter table public.ventas add column if not exists sin_iva boolean not null default false;

-- ---------- Registrar una venta ----------
drop function if exists public.registrar_venta(date, text, jsonb);

create or replace function public.registrar_venta(p_fecha date, p_metodo text, p_items jsonb, p_sin_iva boolean default false)
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
  v_sin_iva boolean := coalesce(p_sin_iva, false);
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

  select condicion_fiscal, alicuota_iva_general into v_cond, v_general
  from public.configuracion_fiscal where id = 1;

  -- "Sin IVA discriminado" solo tiene sentido para quien discrimina IVA (Responsable Inscripto)
  v_sin_iva := coalesce(v_sin_iva and v_cond = 'responsable_inscripto', false); -- coalesce: sin configuración la comparación da "vacío"

  insert into public.ventas (fecha, metodo, total)
  values (coalesce(p_fecha, current_date), p_metodo, 0)
  returning id into v_venta;

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

    if v_cond is not null then
      v_alic := case when v_cond = 'responsable_inscripto' and not v_sin_iva then coalesce(p.alicuota_iva, v_general) else 0 end;
      v_neto := case when v_alic > 0 then round(v_linea / (1 + v_alic / 100), 2) else v_linea end;
      v_iva := v_linea - v_neto;
      v_neto_total := v_neto_total + v_neto;
      v_iva_total := v_iva_total + v_iva;
    else
      v_alic := null;
      v_neto := null;
      v_iva := null;
    end if;

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
      iva = case when v_cond is null then null else v_iva_total end,
      sin_iva = v_sin_iva
  where id = v_venta;

  return v_venta;
end;
$$;

-- ---------- Permisos (igual que antes: solo usuarios con sesión) ----------
revoke all on function public.registrar_venta(date, text, jsonb, boolean) from public, anon;
grant execute on function public.registrar_venta(date, text, jsonb, boolean) to authenticated;
