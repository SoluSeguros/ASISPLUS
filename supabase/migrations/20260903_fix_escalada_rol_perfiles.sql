-- Permisos de escritura por COLUMNA en `perfiles`.
--
-- POR QUÉ: la política `perfil_update_propio` permite que un usuario actualice
-- SU PROPIA fila (id = auth.uid()), porque la app necesita marcar el latido de
-- presencia. Pero la RLS de Postgres filtra FILAS, no COLUMNAS: con un GRANT
-- UPDATE sobre toda la tabla, esa política deja escribir CUALQUIER columna de
-- la fila propia, incluidas `rol` y `empresa` — es decir, permite que una
-- cuenta se cambie a sí misma el rol y gane accesos que no le corresponden.
--
-- QUÉ HACE: restringe el UPDATE a la única columna que la app escribe desde el
-- navegador — `last_seen`, el latido de presencia (js/casos.js, latidoPresencia).
-- Nombre, rol y empresa se cambian solo por la Edge Function admin-usuarios,
-- que usa la service_role y no pasa por estos GRANTs ni por la RLS.
--
-- NO revertir con un `grant update on public.perfiles` general: eso reabriría
-- la escalada. Si en el futuro la app necesita escribir otra columna, añádela
-- de forma explícita: grant update (columna) on public.perfiles to authenticated;

revoke update on public.perfiles from authenticated, anon;
grant  update (last_seen) on public.perfiles to authenticated;
