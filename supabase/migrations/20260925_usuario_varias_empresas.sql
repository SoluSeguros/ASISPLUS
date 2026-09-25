-- Un usuario de empresa puede estar vinculado a VARIAS empresas.
--
-- El caso real que lo motiva: COOMETROPOL opera vehículos que en el parque
-- automotor figuran a nombre de COOINVETRANS, TRANSLAMAYA GUAYABAL, INVETRANS y
-- TRANSCONOR. Son 11 siniestros que su usuario no podía ver, porque la RLS
-- comparaba contra UN solo nombre: `perfiles.empresa`.
--
-- Cómo se modela: una tabla aparte en vez de una columna nueva en `perfiles`.
--
--   - `perfiles.empresa` se queda como está y sigue siendo la empresa principal
--     (la que ya escribe la función edge admin-usuarios). No hay que tocarla ni
--     redesplegar nada, y los perfiles que ya existen siguen funcionando igual.
--   - `perfil_empresas` guarda las ADICIONALES. Es una relación uno a muchos de
--     verdad, así que agregar o quitar una empresa es una fila, no reescribir
--     un arreglo.
--   - El panel de usuarios escribe aquí directamente: `perfiles` no tiene
--     política de UPDATE para el admin (todo pasaba por la función edge), y
--     abrirla entera para esto sería darle más de lo que necesita.
--
-- `empresas_actual()` une las dos fuentes. Las tres políticas de empresa pasan
-- de `= empresa_actual()` a `= any(empresas_actual())`. Con una sola empresa el
-- comportamiento es idéntico al de antes.

begin;

create table if not exists public.perfil_empresas (
  perfil_id  uuid        not null references public.perfiles(id) on delete cascade,
  empresa    text        not null,
  creado_en  timestamptz not null default now(),
  primary key (perfil_id, empresa)
);

comment on table public.perfil_empresas is
  'Empresas ADICIONALES de un perfil. La principal sigue en perfiles.empresa.';

alter table public.perfil_empresas enable row level security;

-- El admin administra la lista; cada usuario puede leer la suya (el portal la
-- muestra en el encabezado).
drop policy if exists perfil_empresas_admin on public.perfil_empresas;
create policy perfil_empresas_admin
  on public.perfil_empresas for all
  using (rol_actual() = 'admin')
  with check (rol_actual() = 'admin');

drop policy if exists perfil_empresas_propias on public.perfil_empresas;
create policy perfil_empresas_propias
  on public.perfil_empresas for select
  using (perfil_id = auth.uid());

-- Todas las empresas del usuario actual: la principal más las adicionales.
-- SECURITY DEFINER como las otras dos funciones, porque la usan las políticas.
create or replace function public.empresas_actual()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array(
    select distinct e
    from (
      select empresa as e from public.perfiles
        where id = auth.uid()
      union
      select empresa from public.perfil_empresas
        where perfil_id = auth.uid()
    ) t
    where e is not null and btrim(e) <> ''
  ), '{}'::text[]);
$$;

comment on function public.empresas_actual() is
  'Empresas del usuario: perfiles.empresa + perfil_empresas. La usan las políticas de rol empresa.';

-- ---------------------------------------------------------------- políticas
-- Se recrean las tres cambiando `= empresa_actual()` por `= any(...)`.
-- Siguen siendo PERMISSIVE y para PUBLIC, igual que antes: esto NO amplía lo
-- que ven los demás roles, solo deja de limitar al de empresa a un nombre.

drop policy if exists empresa_select_parque on public.parque_automotor;
create policy empresa_select_parque
  on public.parque_automotor for select
  using (rol_actual() = 'empresa' and empresa = any (public.empresas_actual()));

drop policy if exists empresa_select_asistencias on public.registro_asistencias;
create policy empresa_select_asistencias
  on public.registro_asistencias for select
  using (rol_actual() = 'empresa' and (datos ->> 'EMPRESA') = any (public.empresas_actual()));

drop policy if exists empresa_select_terceros on public.registro_terceros;
create policy empresa_select_terceros
  on public.registro_terceros for select
  using (
    rol_actual() = 'empresa'
    and exists (
      select 1 from public.registro_asistencias a
      where a.key = registro_terceros.key
        and (a.datos ->> 'EMPRESA') = any (public.empresas_actual())
    )
  );

commit;

-- Comprobación: las tres políticas deben decir ahora `empresas_actual()`.
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and policyname in ('empresa_select_parque', 'empresa_select_asistencias', 'empresa_select_terceros')
order by tablename;
