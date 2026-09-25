-- Las rutas de las fotos de tercero pierden la eñe, para que Storage las acepte.
--
-- Las imágenes históricas (las del AppSheet viejo, que vivían en Google Drive)
-- se suben a Supabase Storage con la MISMA ruta que la base ya guarda en
-- `datos`. Así no hay que reescribir registros: la app las encuentra sola.
--
-- El problema: Storage valida la clave del objeto contra un juego de caracteres
-- ASCII y responde `InvalidKey` con la eñe de "FOTO VEHICULO TERCERO DAÑOS".
-- Son 7.214 referencias repartidas en 1.928 terceros, y es el ÚNICO carácter
-- que estorba en los 36.503 archivos: los siniestros no tienen ninguno.
--
-- La solución: el archivo se sube con N (lo hace `clave_storage()` en
-- supabase/herramientas/subir_fotos_historicas.py) y aquí se deja la referencia
-- apuntando al mismo sitio.
--
-- Qué NO cambia: sólo se toca el VALOR, es decir la ruta. El NOMBRE de la
-- columna sigue con eñe ("FOTO VEHICULO TERCERO DAÑOS"), porque es el que lista
-- TERCERO_FOTOS en js/terceros.js y el que se le muestra al usuario.
--
-- Reversible sin ambigüedad: antes de esto ninguna ruta contenía "DANOS".
-- Repetible: correrlo dos veces no cambia nada la segunda.

begin;

update public.registro_terceros r
set datos = (
  select jsonb_object_agg(
    kv.key,
    case
      when kv.value like 'TERCEROS_Images/%' and kv.value like '%Ñ%'
        then to_jsonb(replace(kv.value, 'Ñ', 'N'))
      -- El resto se copia con `->` y no con kv.value: así los arreglos, los
      -- objetos y los números conservan su tipo en vez de volverse texto.
      else r.datos -> kv.key
    end
  )
  from jsonb_each_text(r.datos) kv
)
where exists (
  select 1 from jsonb_each_text(r.datos) k
  where k.value like 'TERCEROS_Images/%' and k.value like '%Ñ%'
);

commit;

-- Comprobación: 0 con eñe, 7.214 con N, y el total de rutas intacto en 13.077.
select
  (select count(*) from public.registro_terceros r, lateral jsonb_each_text(r.datos) kv
     where kv.value like 'TERCEROS_Images/%' and kv.value like '%Ñ%')
    as con_enye_debe_ser_0,
  (select count(*) from public.registro_terceros r, lateral jsonb_each_text(r.datos) kv
     where kv.value like 'TERCEROS_Images/%DANOS%')
    as rutas_con_N,
  (select count(*) from public.registro_terceros r, lateral jsonb_each_text(r.datos) kv
     where kv.value like 'TERCEROS_Images/%')
    as total_rutas_debe_ser_13077;
