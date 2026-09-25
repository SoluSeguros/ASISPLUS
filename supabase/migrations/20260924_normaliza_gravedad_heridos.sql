-- Normaliza la gravedad "HERIDOS" al catálogo vigente (aplicada el 2026-09-24).
--
-- El catálogo del formulario es SOLO DAÑOS / DAÑOS Y LESIONES / HOMICIDIO
-- (js/casos.js, CAMPOS_OPCIONES). "HERIDOS" viene del AppSheet anterior y dejaba
-- 431 registros fuera de las tres categorías: todo conteo por gravedad los perdía.
--
-- OJO CON EL ENRUTAMIENTO. En js/segvial.js la ruta de Seguridad Vial es:
--     if (hayLesionados || grav === 'HERIDOS' || grav === 'HOMICIDIO') -> LESIONES
--     ...
--     if (grav === 'SOLO DAÑOS' || grav === 'DAÑOS Y LESIONES')        -> V2251
-- "HERIDOS" enruta a LESIONES por sí solo; "DAÑOS Y LESIONES" NO: necesita que
-- LESIONADOS diga que sí. De los 431, 284 lo tenían vacío, así que cambiar solo
-- la gravedad los habría sacado en silencio de la ruta de lesiones. Por eso a
-- esos 284 se les pone LESIONADOS = 'SI': "HERIDOS" ya afirmaba que hubo
-- lesionados, el dato no se inventa, se explicita.
--
-- Los 4 registros que dicen HERIDOS y a la vez LESIONADOS = 'NO' se dejan como
-- están: la contradicción es del dato de origen y necesita criterio humano.
-- Son 24c5c6db, 94afd3b6, f87b5260 y feb1635e.
--
-- Nada se borra: el valor previo queda en GRAVEDAD ORIGINAL / LESIONADOS
-- ORIGINAL, así que la migración es auditable y reversible.
--
-- Dos registros guardaban el NOMBRE del lesionado dentro de LESIONADOS, que es
-- un campo de catálogo. El nombre se conserva en LESIONADOS ORIGINAL y se copia
-- a OBSERVACIONES, que sí se muestra en el detalle (detalle.js y segvial.js
-- dibujan una lista fija de campos: una clave nueva no se vería). El nombre se
-- toma de la propia fila, no de un literal, para no arriesgar la codificación.

begin;

update public.registro_asistencias
   set datos = datos || jsonb_build_object('GRAVEDAD ORIGINAL', datos->>'GRAVEDAD DEL SINIESTRO')
 where upper(trim(datos->>'GRAVEDAD DEL SINIESTRO')) = 'HERIDOS'
   and not (datos ? 'GRAVEDAD ORIGINAL');

update public.registro_asistencias
   set datos = datos || jsonb_build_object('LESIONADOS ORIGINAL', datos->>'LESIONADOS')
 where upper(trim(datos->>'GRAVEDAD DEL SINIESTRO')) = 'HERIDOS'
   and upper(trim(coalesce(datos->>'LESIONADOS',''))) not in ('', 'SI', 'NO', 'POR DEFINIR')
   and not (datos ? 'LESIONADOS ORIGINAL');

update public.registro_asistencias
   set datos = jsonb_set(datos, '{OBSERVACIONES}',
                 to_jsonb(
                   trim(coalesce(datos->>'OBSERVACIONES', ''))
                   || case when trim(coalesce(datos->>'OBSERVACIONES', '')) = '' then '' else E'\n' end
                   || 'Lesionado: ' || trim(datos->>'LESIONADOS')))
 where upper(trim(datos->>'GRAVEDAD DEL SINIESTRO')) = 'HERIDOS'
   and upper(trim(coalesce(datos->>'LESIONADOS',''))) not in ('', 'SI', 'NO', 'POR DEFINIR')
   and position(lower(trim(datos->>'LESIONADOS')) in lower(coalesce(datos->>'OBSERVACIONES',''))) = 0;

update public.registro_asistencias
   set datos = datos || '{"LESIONADOS": "SI"}'::jsonb
 where upper(trim(datos->>'GRAVEDAD DEL SINIESTRO')) = 'HERIDOS'
   and upper(trim(coalesce(datos->>'LESIONADOS',''))) <> 'NO'
   and coalesce(datos->>'LESIONADOS', '') <> 'SI';

update public.registro_asistencias
   set datos = datos || '{"GRAVEDAD DEL SINIESTRO": "DAÑOS Y LESIONES"}'::jsonb
 where upper(trim(datos->>'GRAVEDAD DEL SINIESTRO')) = 'HERIDOS';

commit;
