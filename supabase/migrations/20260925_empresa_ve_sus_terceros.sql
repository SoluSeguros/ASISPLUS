-- La empresa puede leer los terceros de SUS casos (y solo de los suyos).
--
-- Hasta ahora `reg_ter_select` decía `rol_actual() <> 'empresa'`: el rol empresa
-- estaba excluido de registro_terceros por completo. Tenía sentido cuando su
-- portal solo mostraba una lista de casos con datos del vehículo.
--
-- Ahora el portal muestra la ficha completa del caso, con la evidencia
-- fotográfica del siniestro y la de cada tercero involucrado. Sin esta política
-- esa sección saldría siempre vacía, y peor: vacía sin decir por qué.
--
-- El alcance es el mismo que ya tiene `empresa_select_asistencias` sobre los
-- siniestros: se cruza por KEY contra el caso y se exige que ese caso sea de la
-- empresa del perfil. Una empresa no puede ver los terceros de otra.
--
-- Las políticas de SELECT se suman (OR), así que esta NO amplía lo que ven los
-- demás roles: `reg_ter_select` sigue igual para ellos.
--
-- Repetible: se borra antes de crear.

begin;

drop policy if exists empresa_select_terceros on public.registro_terceros;

create policy empresa_select_terceros
  on public.registro_terceros
  for select
  using (
    rol_actual() = 'empresa'
    and exists (
      select 1
      from public.registro_asistencias a
      where a.key = registro_terceros.key
        and (a.datos ->> 'EMPRESA') = empresa_actual()
    )
  );

commit;

-- El cruce va por `key` en las dos tablas y ya está indexado en ambas
-- (idx_reg_ter_key y registro_asistencias_key_key), así que no añade trabajo.

-- Comprobación: deben aparecer las dos políticas de SELECT sobre terceros.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'registro_terceros' and cmd = 'SELECT'
order by policyname;
