-- ============================================================================
-- La empresa puede registrar sus propios vehículos
-- ============================================================================
-- Hasta hoy el parque automotor sólo lo escribía la administración (política
-- `auth_all_parque`, que excluye al rol empresa). Eso dejaba a ERMIS —y a
-- cualquier transportadora con acceso— mirando un listado que no podía
-- completar: si entra un bus nuevo, hay que pedirlo por fuera de la app y
-- esperar a que alguien lo cargue. Mientras tanto, los casos de ese vehículo
-- no cruzan con el parque y salen sin tipo, sin modelo y sin propietario.
--
-- Esta migración abre el INSERT para el rol empresa, acotado a SUS empresas,
-- y pone en la base las tres garantías que no se pueden dejar al navegador:
--
--   1. `key` se genera sola (secuencia). El cliente no puede calcular el
--      máximo: la RLS sólo le deja ver sus propias filas, así que un
--      "max(key)+1" desde el navegador chocaría con la fila de otra empresa.
--   2. La placa se normaliza SIEMPRE al grabar (mayúsculas, sin espacios ni
--      guiones). En el parque ya hay 121 placas escritas "TPZ 433" y esas no
--      cruzan con los siniestros; ninguna nueva va a nacer así.
--   3. No se puede repetir una placa dentro de la misma empresa (doble clic,
--      o el mismo Excel importado dos veces).
--
-- Lo que NO abre: actualizar ni borrar. La empresa agrega; corregir o quitar
-- sigue siendo de la administración. Y registrar un vehículo no amplía lo que
-- la empresa ve: los siniestros se filtran por `datos->>'EMPRESA'` del caso,
-- no por el parque.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. La llave se genera sola
-- --------------------------------------------------------------------------
-- Las 1.785 claves actuales son números ("1".."1792"), todas distintas. La
-- secuencia arranca donde terminó el último cargue manual.
create sequence if not exists public.parque_automotor_key_seq as bigint;

select setval(
  'public.parque_automotor_key_seq',
  greatest(
    coalesce((select max(key::bigint) from public.parque_automotor
               where key ~ '^[0-9]+$'), 0),
    1
  ),
  true
);

alter table public.parque_automotor
  alter column key set default nextval('public.parque_automotor_key_seq')::text;

-- Los cargues de la administración siguen pudiendo mandar su propia `key`
-- (los scripts de importación lo hacen); el default sólo actúa si no viene.

-- --------------------------------------------------------------------------
-- 2. Normalización y validación al insertar
-- --------------------------------------------------------------------------
-- Sólo BEFORE INSERT a propósito: las filas que ya existen no se tocan. Si
-- mañana se decide arreglar las 121 placas con espacio, que sea un UPDATE
-- explícito y revisable, no un efecto colateral de este trigger.
create or replace function public.parque_automotor_normaliza()
returns trigger
language plpgsql
as $$
declare
  v_placa text;
begin
  new.empresa := nullif(btrim(coalesce(new.empresa, '')), '');
  if new.empresa is null then
    raise exception 'Falta la empresa del vehículo.'
      using errcode = 'check_violation';
  end if;

  -- "eqs-961", "TPZ 433" y "tpz433" son la misma placa. Se guarda una sola
  -- forma: la que usan los siniestros para cruzar.
  v_placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_placa = '' then
    raise exception 'Falta la placa del vehículo.'
      using errcode = 'check_violation';
  end if;
  new.placa := v_placa;

  if exists (
    select 1 from public.parque_automotor p
     where p.empresa = new.empresa
       and upper(regexp_replace(coalesce(p.placa, ''), '[^A-Za-z0-9]', '', 'g')) = v_placa
  ) then
    raise exception 'La placa % ya está registrada en %.', v_placa, new.empresa
      using errcode = 'unique_violation';
  end if;

  -- Textos libres: se recortan y se suben a mayúscula los que el resto de la
  -- app compara en mayúscula (tipo, nombres), para que el listado no mezcle
  -- "Bus", "BUS" y "bus ".
  new.numero_interno      := nullif(btrim(coalesce(new.numero_interno, '')), '');
  new.tipo                := nullif(upper(btrim(coalesce(new.tipo, ''))), '');
  new.modelo              := nullif(btrim(coalesce(new.modelo, '')), '');
  new.aseguradora         := nullif(upper(btrim(coalesce(new.aseguradora, ''))), '');
  new.propietario         := nullif(upper(btrim(coalesce(new.propietario, ''))), '');
  new.nombre_conductor    := nullif(upper(btrim(coalesce(new.nombre_conductor, ''))), '');
  new.cedula_propietario  := nullif(regexp_replace(coalesce(new.cedula_propietario, ''), '[^0-9]', '', 'g'), '');
  new.cedula_conductor    := nullif(regexp_replace(coalesce(new.cedula_conductor, ''), '[^0-9]', '', 'g'), '');
  new.telefono_propietario := nullif(regexp_replace(coalesce(new.telefono_propietario, ''), '[^0-9]', '', 'g'), '');
  new.telefono_conductor   := nullif(regexp_replace(coalesce(new.telefono_conductor, ''), '[^0-9]', '', 'g'), '');
  new.correo_empresa      := nullif(btrim(coalesce(new.correo_empresa, '')), '');

  -- El correo del afiliado va al caso como "CORREO AFILIADO" (ver casos.js).
  -- Si no lo mandan, se hereda del resto de la flota de esa empresa: nadie va
  -- a escribirlo bien 40 veces seguidas.
  if new.correo_empresa is null then
    select p.correo_empresa into new.correo_empresa
      from public.parque_automotor p
     where p.empresa = new.empresa
       and coalesce(btrim(p.correo_empresa), '') <> ''
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists parque_automotor_normaliza_ins on public.parque_automotor;
create trigger parque_automotor_normaliza_ins
  before insert on public.parque_automotor
  for each row execute function public.parque_automotor_normaliza();

-- --------------------------------------------------------------------------
-- 3. Permiso de alta para el rol empresa
-- --------------------------------------------------------------------------
-- `empresas_actual()` devuelve la empresa principal del perfil más las de
-- perfil_empresas: ERMIS puede dar de alta en las cuatro que administra, y en
-- ninguna otra.
drop policy if exists empresa_insert_parque on public.parque_automotor;
create policy empresa_insert_parque on public.parque_automotor
  for insert to authenticated
  with check (
    rol_actual() = 'empresa'
    and empresa = any (empresas_actual())
  );

comment on policy empresa_insert_parque on public.parque_automotor is
  'La transportadora registra vehículos en sus propias empresas. No puede actualizar ni borrar: eso sigue siendo de la administración.';
