-- Da número de caso a los 2.707 siniestros históricos, que venían del AppSheet
-- anterior sin numerar y salían como "—" en el portal de la empresa.
--
-- Formato H-AAAA-NNNN, correlativo por año y ordenado por la fecha REAL del
-- siniestro. El prefijo "H-" lo separa de los CASO-AAAA-NNNNN que genera la
-- app, así que:
--   · no choca con el índice único idx_reg_asis_numero_caso;
--   · no gasta la secuencia seq_numero_caso (el próximo caso real sigue siendo
--     el CASO-2026-00091);
--   · de un vistazo se sabe si un caso viene del histórico o de la app.
--
-- El disparador trg_numero_caso es solo de INSERT, así que estos UPDATE no lo
-- despiertan.
--
-- La fecha viene en dos formatos según la época: MM/DD/YYYY en lo que salió de
-- AppSheet y YYYY-MM-DD en lo que escribió la app. Se leen los dos. Se verificó
-- que las 2.707 son legibles (0 sin fecha).
--
-- El desempate por `key` es para que el número sea determinista: dos siniestros
-- del mismo día siempre quedan en el mismo orden, se corra cuando se corra.
--
-- Para revertir:  update public.registro_asistencias
--                    set numero_caso = null
--                  where estado = 'HISTORICO' and numero_caso like 'H-%';

begin;

with fechas as (
  select id, key,
         case when datos->>'FECHA DEL SINIESTRO' ~ '^\d{4}-\d{2}-\d{2}'
              then substr(datos->>'FECHA DEL SINIESTRO', 1, 10)::date
              when datos->>'FECHA DEL SINIESTRO' ~ '^\d{1,2}/\d{1,2}/\d{4}$'
              then to_date(datos->>'FECHA DEL SINIESTRO', 'MM/DD/YYYY')
              else null end as fecha
    from public.registro_asistencias
   where estado = 'HISTORICO' and numero_caso is null
),
numerados as (
  select id,
         extract(year from fecha)::int as anio,
         row_number() over (
           partition by extract(year from fecha)::int
           order by fecha, key
         ) as consecutivo
    from fechas
   where fecha is not null
)
update public.registro_asistencias a
   set numero_caso = 'H-' || n.anio || '-' || lpad(n.consecutivo::text, 4, '0')
  from numerados n
 where a.id = n.id;

commit;

-- Comprobación
select (select count(*) from public.registro_asistencias
          where estado='HISTORICO' and numero_caso is null) as historicos_sin_numero,
       (select count(*) from public.registro_asistencias
          where numero_caso like 'H-%') as numerados,
       (select count(*) from public.registro_asistencias
          where numero_caso like 'CASO-%') as de_la_app,
       (select last_value from public.seq_numero_caso) as secuencia_intacta;
