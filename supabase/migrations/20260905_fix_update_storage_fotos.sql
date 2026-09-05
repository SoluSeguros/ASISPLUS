-- Permitir REEMPLAZAR archivos en los buckets `fotos-casos` y `documentos-casos`.
--
-- POR QUÉ: la app guarda varias evidencias en una RUTA FIJA por caso, para que
-- siempre exista una sola versión vigente:
--
--   <caso>/firmas/FIRMA_CONDUCTOR.png
--   <caso>/firmas/FIRMA_ASISTENTE_EN_SITIO.png
--   <caso>/croquis.png  ·  <caso>/croquis-fondo.jpg
--   <caso>/terceros/<id>/<campo>.png
--
-- Todas se suben con `upsert: true`. La PRIMERA vez es un INSERT en
-- storage.objects y funciona; a partir de la segunda, Storage hace un UPDATE
-- sobre la fila existente. Estos dos buckets tenían políticas de INSERT, SELECT
-- y DELETE, pero NO de UPDATE, así que ese reemplazo era rechazado con
-- "new row violates row-level security policy".
--
-- Consecuencia en producción: volver a firmar o volver a guardar el croquis
-- fallaba siempre. Al revisar, NINGUNO de los 212 objetos de `fotos-casos`
-- había sido reescrito nunca. Cuando el reintento venía de la cola offline, la
-- operación se quedaba atascada y frenaba el resto de la cola.
--
-- El bucket `versiones-audio` ya tenía su política de UPDATE (`audio_update`);
-- esto solo empareja los otros dos con ese mismo criterio.
--
-- No amplía el alcance de nadie: quien ya podía INSERT y DELETE sobre estos
-- buckets podía reemplazar un archivo borrándolo y subiéndolo de nuevo. Esto
-- solo permite hacerlo en un paso, que es lo que la app siempre quiso hacer.

create policy fotos_update on storage.objects
  for update to authenticated
  using       (bucket_id = 'fotos-casos')
  with check  (bucket_id = 'fotos-casos');

create policy docs_update on storage.objects
  for update to authenticated
  using       (bucket_id = 'documentos-casos')
  with check  (bucket_id = 'documentos-casos');
