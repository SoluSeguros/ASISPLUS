-- ============================================================================
-- Servicios adicionales + módulo de Infracciones (comparendos)
-- ============================================================================
-- Hay desarrollos que no son parte de ASIS PLUS para todo el mundo: se hacen a
-- pedido de un cliente, se le cobran a ese cliente y sólo ese cliente los ve.
-- El primero es el histórico de comparendos del GRUPO COOMETROPOL, que hoy vive
-- en un Excel que circula por correo.
--
-- En vez de esconder el módulo con un `if (usuario === 'ermis')` en el
-- navegador —que no es seguridad, es decoración— se modela de verdad:
--
--   servicios_adicionales : el catálogo de lo que se puede contratar.
--   perfil_servicios      : quién lo tiene contratado.
--   tiene_servicio(clave) : lo que pregunta la RLS antes de devolver una fila.
--
-- Así, el día que otra empresa compre el mismo módulo, es marcarle una casilla.
-- Y si a ERMIS se le quita el servicio, deja de ver los datos AUNQUE alguien le
-- arme la petición a mano: el filtro está en la base, no en la pantalla.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Catálogo de servicios
-- --------------------------------------------------------------------------
create table if not exists public.servicios_adicionales (
  clave       text primary key,
  nombre      text not null,
  descripcion text,
  icono       text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

comment on table public.servicios_adicionales is
  'Módulos que se desarrollan a pedido y se habilitan por usuario. No son parte de ASIS PLUS para todos.';

insert into public.servicios_adicionales (clave, nombre, descripcion, icono)
values ('infracciones', 'Histórico de infracciones',
        'Comparendos del parque: consulta, registro y seguimiento de pago, con el conductor infractor y la responsabilidad solidaria de la empresa.',
        '🚦')
on conflict (clave) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      icono = excluded.icono;

-- --------------------------------------------------------------------------
-- 2. Quién tiene cada servicio
-- --------------------------------------------------------------------------
create table if not exists public.perfil_servicios (
  perfil_id     uuid not null references public.perfiles(id) on delete cascade,
  servicio      text not null references public.servicios_adicionales(clave) on delete cascade,
  habilitado_en timestamptz not null default now(),
  primary key (perfil_id, servicio)
);

create index if not exists perfil_servicios_servicio_idx on public.perfil_servicios(servicio);

-- --------------------------------------------------------------------------
-- 3. La pregunta que hace la RLS
-- --------------------------------------------------------------------------
-- SECURITY DEFINER como las demás (rol_actual, empresas_actual): si leyera
-- perfil_servicios con los permisos de quien pregunta, haría falta una política
-- en esa tabla para poder evaluar la política de esta otra, y se enreda sola.
create or replace function public.tiene_servicio(p_clave text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.perfil_servicios ps
      join public.servicios_adicionales s on s.clave = ps.servicio
     where ps.perfil_id = auth.uid()
       and ps.servicio = p_clave
       and s.activo
  );
$$;

-- --------------------------------------------------------------------------
-- 4. Las infracciones
-- --------------------------------------------------------------------------
create table if not exists public.infracciones (
  id             bigint generated always as identity primary key,
  empresa        text not null,
  placa          text not null,
  numero_interno text,
  fecha          date not null,
  ruta           text,
  comparendo     text,
  codigo         text,
  infraccion     text,
  cedula_conductor text,
  conductor      text,
  -- Dos estados y nada más. En el Excel venían escritos de cinco formas
  -- distintas ("SIN CANCELAR", "Sin Cancelar", "Cancelada", "CANCELADA" y
  -- "CANELADA"), que es exactamente lo que impide contar cuánto se debe.
  estado         text not null default 'SIN CANCELAR'
                 check (estado in ('CANCELADA', 'SIN CANCELAR')),
  solidaridad    boolean not null default false,  -- responde también la empresa
  foto_multa     boolean not null default false,  -- detectado por fotomulta
  observaciones  text,
  origen         text not null default 'app',     -- 'importado' | 'app'
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists infracciones_empresa_idx on public.infracciones(empresa);
create index if not exists infracciones_placa_idx   on public.infracciones(placa);
create index if not exists infracciones_fecha_idx   on public.infracciones(fecha desc);

comment on column public.infracciones.comparendo is
  'Número del comparendo. Puede venir vacío o incompleto: en el Excel original 161 de 230 llegaron en notación científica y perdieron los últimos dígitos.';

-- Normalización al grabar, por la misma razón que en el parque: la placa es lo
-- que cruza con el vehículo, y "tsk 974" no cruza con nada.
create or replace function public.infracciones_normaliza()
returns trigger
language plpgsql
as $$
begin
  new.empresa := nullif(btrim(coalesce(new.empresa, '')), '');
  if new.empresa is null then
    raise exception 'Falta la empresa de la infracción.' using errcode = 'check_violation';
  end if;

  new.placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if new.placa = '' then
    raise exception 'Falta la placa del vehículo.' using errcode = 'check_violation';
  end if;

  new.estado           := upper(btrim(coalesce(new.estado, 'SIN CANCELAR')));
  new.numero_interno   := nullif(btrim(coalesce(new.numero_interno, '')), '');
  new.ruta             := nullif(btrim(coalesce(new.ruta, '')), '');
  new.comparendo       := nullif(btrim(coalesce(new.comparendo, '')), '');
  new.codigo           := nullif(upper(btrim(coalesce(new.codigo, ''))), '');
  new.infraccion       := nullif(btrim(coalesce(new.infraccion, '')), '');
  new.conductor        := nullif(upper(btrim(coalesce(new.conductor, ''))), '');
  new.cedula_conductor := nullif(regexp_replace(coalesce(new.cedula_conductor, ''), '[^0-9]', '', 'g'), '');
  new.observaciones    := nullif(btrim(coalesce(new.observaciones, '')), '');

  -- El número interno y la empresa salen del parque cuando la placa está
  -- registrada: el parque es la fuente de verdad del vehículo, y así la fila
  -- queda bajo la empresa que de verdad lo opera (la RLS filtra por ahí).
  if new.numero_interno is null then
    select p.numero_interno into new.numero_interno
      from public.parque_automotor p
     where upper(regexp_replace(coalesce(p.placa, ''), '[^A-Za-z0-9]', '', 'g')) = new.placa
       and coalesce(btrim(p.numero_interno), '') <> ''
     limit 1;
  end if;

  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  if new.creado_por is null then new.creado_por := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists infracciones_normaliza_tr on public.infracciones;
create trigger infracciones_normaliza_tr
  before insert or update on public.infracciones
  for each row execute function public.infracciones_normaliza();

-- --------------------------------------------------------------------------
-- 5. Permisos
-- --------------------------------------------------------------------------
alter table public.servicios_adicionales enable row level security;
alter table public.perfil_servicios      enable row level security;
alter table public.infracciones          enable row level security;

-- El catálogo lo puede leer cualquiera que haya entrado (el portal necesita el
-- nombre y el icono del módulo); sólo el admin lo cambia.
drop policy if exists servicios_select on public.servicios_adicionales;
create policy servicios_select on public.servicios_adicionales
  for select to authenticated using (true);

drop policy if exists servicios_admin on public.servicios_adicionales;
create policy servicios_admin on public.servicios_adicionales
  for all to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

-- Cada quien ve lo que tiene contratado; el admin ve y asigna todo.
drop policy if exists perfil_servicios_propio on public.perfil_servicios;
create policy perfil_servicios_propio on public.perfil_servicios
  for select to authenticated using (perfil_id = auth.uid());

drop policy if exists perfil_servicios_admin on public.perfil_servicios;
create policy perfil_servicios_admin on public.perfil_servicios
  for all to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

-- Infracciones: la administración entra completa; los roles internos consultan.
drop policy if exists infracciones_admin on public.infracciones;
create policy infracciones_admin on public.infracciones
  for all to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

drop policy if exists infracciones_interno_select on public.infracciones;
create policy infracciones_interno_select on public.infracciones
  for select to authenticated
  using (rol_actual() is not null and rol_actual() <> 'empresa');

-- La empresa: sólo si tiene el servicio contratado Y sólo sus empresas. Las dos
-- condiciones se repiten en las cuatro operaciones a propósito; una política de
-- UPDATE sin WITH CHECK dejaría mover una fila a la empresa de al lado.
drop policy if exists infracciones_empresa_select on public.infracciones;
create policy infracciones_empresa_select on public.infracciones
  for select to authenticated
  using (rol_actual() = 'empresa' and tiene_servicio('infracciones')
         and empresa = any (empresas_actual()));

drop policy if exists infracciones_empresa_insert on public.infracciones;
create policy infracciones_empresa_insert on public.infracciones
  for insert to authenticated
  with check (rol_actual() = 'empresa' and tiene_servicio('infracciones')
              and empresa = any (empresas_actual()));

drop policy if exists infracciones_empresa_update on public.infracciones;
create policy infracciones_empresa_update on public.infracciones
  for update to authenticated
  using (rol_actual() = 'empresa' and tiene_servicio('infracciones')
         and empresa = any (empresas_actual()))
  with check (rol_actual() = 'empresa' and tiene_servicio('infracciones')
              and empresa = any (empresas_actual()));

drop policy if exists infracciones_empresa_delete on public.infracciones;
create policy infracciones_empresa_delete on public.infracciones
  for delete to authenticated
  using (rol_actual() = 'empresa' and tiene_servicio('infracciones')
         and empresa = any (empresas_actual()));
