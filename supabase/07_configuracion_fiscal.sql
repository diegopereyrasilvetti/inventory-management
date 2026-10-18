-- =====================================================================
-- Gestión de Stock - Impuestos, fase 1: configuración fiscal
-- Se pega y ejecuta una sola vez en Supabase > SQL Editor, DESPUÉS de 01 a 06.
-- Es seguro correrlo de nuevo. NO borra ni modifica ningún dato existente: solo agrega tablas nuevas.
--
-- Guarda UNA configuración fiscal para toda la empresa:
--   - condición fiscal (Responsable Inscripto / Monotributista / Exento)
--   - alícuotas de IVA disponibles y alícuota general
--   - Impuesto al Cheque (activo, % créditos, % débitos, % computable como pago a cuenta)
--   - cuota mensual de monotributo, saldo inicial de caja
--   - fecha de inicio de la nueva contabilidad (el día en que se activa; después no se mueve)
--
-- Permisos: todas las personas activas la pueden VER; solo los administradores la pueden CAMBIAR.
-- Cada cambio queda guardado en un historial (quién, cuándo, qué había antes).
-- =====================================================================

-- ---------- Validación de la lista de alícuotas ----------
create or replace function public.alicuotas_validas(a numeric[])
returns boolean
language sql
immutable
as $$
  select a is not null
     and coalesce(array_length(a, 1), 0) between 1 and 12
     and not exists (select 1 from unnest(a) x where x is null or x < 0 or x > 100);
$$;

-- ---------- Tabla (una sola fila, id = 1) ----------
create table if not exists public.configuracion_fiscal (
  id                        smallint primary key default 1 check (id = 1),
  condicion_fiscal          text    not null default 'responsable_inscripto'
                              check (condicion_fiscal in ('responsable_inscripto', 'monotributista', 'exento')),
  alicuota_iva_general      numeric(5,2) not null default 21 check (alicuota_iva_general between 0 and 100),
  alicuotas_iva             numeric(5,2)[] not null default '{21,10.5,27,0}' check (public.alicuotas_validas(alicuotas_iva)),
  cheque_activo             boolean not null default true,
  cheque_pct_credito        numeric(7,4) not null default 0.6 check (cheque_pct_credito between 0 and 100),
  cheque_pct_debito         numeric(7,4) not null default 0.6 check (cheque_pct_debito between 0 and 100),
  cheque_pct_computable     numeric(6,2) not null default 33 check (cheque_pct_computable between 0 and 100),
  monotributo_cuota_mensual numeric(14,2) not null default 0 check (monotributo_cuota_mensual >= 0),
  saldo_inicial             numeric(14,2) not null default 0,
  fecha_inicio_contabilidad date,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references auth.users(id) on delete set null,
  check (alicuota_iva_general = any (alicuotas_iva))
);

-- Fila inicial con los valores por defecto (si ya existe, no se toca)
insert into public.configuracion_fiscal (id) values (1) on conflict (id) do nothing;

-- ---------- Historial de cambios ----------
create table if not exists public.configuracion_fiscal_historial (
  id          bigint generated always as identity primary key,
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid references auth.users(id) on delete set null,
  antes       jsonb,
  despues     jsonb not null
);

-- ---------- Reglas al modificar ----------
create or replace function public.configuracion_fiscal_antes_de_cambiar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- La fecha de inicio de la nueva contabilidad se fija una vez y no se puede mover ni borrar:
  -- cambiarla reescribiría el pasado y duplicaría o perdería operaciones en los balances.
  if old.fecha_inicio_contabilidad is not null
     and new.fecha_inicio_contabilidad is distinct from old.fecha_inicio_contabilidad then
    raise exception 'La fecha de inicio de la nueva contabilidad ya está definida y no se puede cambiar.'
      using errcode = 'GS001';
  end if;
  if new.fecha_inicio_contabilidad is not null
     and old.fecha_inicio_contabilidad is null
     and new.fecha_inicio_contabilidad <> current_date then
    raise exception 'La nueva contabilidad se activa con la fecha de hoy.' using errcode = 'GS001';
  end if;

  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists configuracion_fiscal_antes on public.configuracion_fiscal;
create trigger configuracion_fiscal_antes
  before update on public.configuracion_fiscal
  for each row execute function public.configuracion_fiscal_antes_de_cambiar();

-- El historial lo escribe la base (no las personas), por eso la función corre con permisos propios
create or replace function public.configuracion_fiscal_registrar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.configuracion_fiscal_historial (cambiado_por, antes, despues)
  values (auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists configuracion_fiscal_despues on public.configuracion_fiscal;
create trigger configuracion_fiscal_despues
  after update on public.configuracion_fiscal
  for each row execute function public.configuracion_fiscal_registrar_cambio();

-- ---------- Seguridad (RLS) ----------
alter table public.configuracion_fiscal enable row level security;
alter table public.configuracion_fiscal_historial enable row level security;

drop policy if exists "configuracion_fiscal: ver" on public.configuracion_fiscal;
create policy "configuracion_fiscal: ver" on public.configuracion_fiscal
  for select to authenticated using (public.es_miembro());

drop policy if exists "configuracion_fiscal: administradores modifican" on public.configuracion_fiscal;
create policy "configuracion_fiscal: administradores modifican" on public.configuracion_fiscal
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "configuracion_fiscal_historial: ver" on public.configuracion_fiscal_historial;
create policy "configuracion_fiscal_historial: ver" on public.configuracion_fiscal_historial
  for select to authenticated using (public.es_miembro());

-- Sin políticas de insert/delete: nadie puede crear ni borrar filas desde la web.
revoke all on public.configuracion_fiscal from anon, authenticated;
revoke all on public.configuracion_fiscal_historial from anon, authenticated;
grant select, update on public.configuracion_fiscal to authenticated;
grant select on public.configuracion_fiscal_historial to authenticated;
