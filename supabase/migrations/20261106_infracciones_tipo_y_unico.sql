-- Tipo de comparendo y número de comparendo único.
--
-- El reporte nuevo (BASE DE DATOS Infracciones: una hoja por empresa, con
-- Fecha_Comparendo, Comparendo_Nro, Placa, Código_Infracción, Infracción,
-- Tipo_Comparendo, Cédula, Nombre_Infractor e ID_EMPRESA) trae un dato que el
-- histórico no tenía: el tipo. Llega con cuatro valores —Infracción (agente),
-- Electrónico (fotomulta), Educativo y NN o Sticker (sin conductor
-- identificado)— y se guarda tal cual. Las 230 del histórico quedan en null:
-- su Excel no lo traía y "foto multa" no alcanza para deducir los otros tres.
alter table public.infracciones
  add column if not exists tipo_comparendo text;

comment on column public.infracciones.tipo_comparendo is
  'Tipo del comparendo como lo trae el reporte: Infracción, Electrónico, Educativo, NN o Sticker. Null en las 230 del histórico.';

-- Los reportes van a seguir llegando y pueden solaparse (el del mes siguiente
-- repite parte del anterior). El número de comparendo es único en el país: con
-- este índice, cargar dos veces el mismo comparendo no lo duplica (la carga usa
-- ON CONFLICT DO NOTHING) y el formulario avisa si alguien lo vuelve a escribir.
-- Es parcial porque 184 del histórico no tienen número (Excel lo destruyó con
-- la notación científica) y esos no se pueden comparar.
create unique index if not exists infracciones_comparendo_unico
  on public.infracciones (comparendo)
  where comparendo is not null and comparendo <> '';
