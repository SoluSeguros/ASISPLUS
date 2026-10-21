-- Hora del comparendo.
--
-- El histórico que se importó (HISTORICO INFRACCIONES GRUPO COOMETROPOL) trae
-- 17 columnas —Año, Mes, Día de la semana, Fecha, Placa, Bus, Empresa, Ruta,
-- Comparendo, Código, Infracción, Cédula, Conductor, Estado, Solidaridad,
-- Observaciones y Foto multa— y NINGUNA de hora. Las 230 filas importadas
-- quedan entonces en null a propósito: la estadística dice cuántas no tienen
-- hora en vez de repartirlas en una franja inventada.
--
-- El mes y el día de la semana no necesitan columna: se calculan de `fecha`
-- (se comprobó contra la columna "Día" del propio Excel, 230 de 230 iguales).
-- La hora sí, porque no se puede deducir de nada.
alter table public.infracciones
  add column if not exists hora time;

comment on column public.infracciones.hora is
  'Hora del comparendo. Null en las 230 importadas del Excel, que vino sin hora.';
