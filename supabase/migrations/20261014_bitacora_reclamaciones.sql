-- ============================================================================
-- Bitácora de reclamaciones
-- ============================================================================
-- Hoy el proceso vive en un Excel de 35 hojas, una por empresa, con las mismas
-- columnas en posiciones distintas y nombres distintos. De las 555
-- reclamaciones, 123 tienen un diario escrito dentro de la casilla "ESTADO"
-- (así que no se sabe en qué van), el valor es texto libre —"1'650,000.700.000",
-- "PRETENSION26772543,63/OFRECIMIENTO:26772543"— y sólo 167 fechas de siniestro
-- son fechas de verdad.
--
-- Dos decisiones de modelo que vienen de ahí:
--
--  1. El ESTADO es una lista cerrada. Es lo único que permite contestar
--     "¿cuántas están radicadas?" sin leer 555 celdas de prosa.
--  2. La bitácora deja de ser una celda que todos reescriben y pasa a ser una
--     tabla de notas con fecha y autor. Lo que había en el Excel entra como
--     UNA nota histórica, sin trocearla: partir prosa ajena con expresiones
--     regulares es la forma más rápida de inventar un historial que nadie
--     escribió.
--
-- El dinero queda en dos columnas numéricas (pretensión y ofrecimiento) más el
-- texto original intacto: lo que no se pudo leer no se tira, se deja a la vista
-- para completarlo a mano.
--
-- Acceso: es un proceso INTERNO de SoluSeguros. Lo trabajan el rol
-- "reclamaciones" y el admin; los demás roles internos pueden consultarlo; el
-- rol "empresa" no lo ve.
--
-- OJO con el nombre: ya existe una tabla `reclamaciones` con 28 filas que son
-- otra cosa —las reclamaciones EN CONTRA importadas del AppSheet viejo, donde
-- el tercero le reclama a la empresa—. Esta bitácora es al revés: lo que la
-- empresa le reclama a una aseguradora. Por eso `bitacora_reclamaciones` y no
-- `reclamaciones`: son dos procesos distintos y mezclarlos sería un error que
-- después no se puede deshacer.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. La reclamación
-- --------------------------------------------------------------------------
create table if not exists public.bitacora_reclamaciones (
  id             bigint generated always as identity primary key,
  empresa        text not null,
  placa          text,
  propietario    text,
  contra         text,          -- aseguradora o empresa a la que se le reclama
  encargado      text,          -- quién la lleva en SoluSeguros
  estado         text not null default 'RECOLECCION DE INFORMACION',
  radicado       text,
  fecha_siniestro       date,
  fecha_siniestro_texto text,   -- lo que decía el Excel cuando no era una fecha
  fecha_actualizacion   date,
  pretension     numeric(14, 2),
  ofrecimiento   numeric(14, 2),
  valor_texto    text,          -- la celda original, tal cual, cuando no se pudo leer
  caso_key       text,          -- enlace con registro_asistencias.key
  numero_caso    text,
  hoja_origen    text,          -- de qué hoja del Excel salió (para poder auditar)
  origen         text not null default 'app',   -- 'importado' | 'app'
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Lista cerrada: sin esto, "ESTADO" vuelve a ser un campo de texto donde cada
-- quien escribe lo suyo, que es de donde venimos.
alter table public.bitacora_reclamaciones drop constraint if exists bitacora_estado_ck;
alter table public.bitacora_reclamaciones add constraint bitacora_estado_ck check (estado in (
  'RECOLECCION DE INFORMACION',
  'ASIGNACION DE TALLER',
  'RADICADA',
  'EN TRAMITE',
  'OFRECIMIENTO',
  'OBJETADA',
  'PAGADA',
  'NO PROCEDE',
  'DESISTIDA',
  'TERMINADA'
));

create index if not exists bitacora_empresa_idx  on public.bitacora_reclamaciones(empresa);
create index if not exists bitacora_placa_idx    on public.bitacora_reclamaciones(placa);
create index if not exists bitacora_estado_idx   on public.bitacora_reclamaciones(estado);
create index if not exists bitacora_fecha_idx    on public.bitacora_reclamaciones(fecha_siniestro desc nulls last);
create index if not exists bitacora_caso_idx     on public.bitacora_reclamaciones(caso_key);

comment on column public.bitacora_reclamaciones.valor_texto is
  'La celda VALOR del Excel tal cual. 273 de 555 no se pudieron leer como número; se conservan para completarlas a mano.';

-- --------------------------------------------------------------------------
-- 2. La bitácora: una nota por entrada, no una celda que se reescribe
-- --------------------------------------------------------------------------
create table if not exists public.bitacora_notas (
  id              bigint generated always as identity primary key,
  reclamacion_id  bigint not null references public.bitacora_reclamaciones(id) on delete cascade,
  fecha           date not null default current_date,
  texto           text not null,
  autor           text,
  autor_id        uuid,
  creado_en       timestamptz not null default now()
);

create index if not exists bitacora_notas_rec_idx
  on public.bitacora_notas(reclamacion_id, fecha desc, id desc);

-- --------------------------------------------------------------------------
-- 3. Normalización al grabar
-- --------------------------------------------------------------------------
create or replace function public.bitacora_bitacora_normaliza()
returns trigger
language plpgsql
as $$
begin
  new.empresa := nullif(btrim(coalesce(new.empresa, '')), '');
  if new.empresa is null then
    raise exception 'Falta la empresa de la reclamación.' using errcode = 'check_violation';
  end if;

  -- La placa es lo que cruza con el parque y con el siniestro. Hay 12
  -- reclamaciones sin placa en el Excel, así que aquí NO es obligatoria: se
  -- deja entrar y se ve vacía, que es la verdad.
  new.placa := nullif(upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g')), '');

  new.estado      := upper(btrim(coalesce(new.estado, 'RECOLECCION DE INFORMACION')));
  new.propietario := nullif(upper(btrim(coalesce(new.propietario, ''))), '');
  new.contra      := nullif(upper(btrim(coalesce(new.contra, ''))), '');
  new.encargado   := nullif(upper(btrim(coalesce(new.encargado, ''))), '');
  new.radicado    := nullif(btrim(coalesce(new.radicado, '')), '');

  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  if new.creado_por is null then new.creado_por := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists bitacora_normaliza_tr on public.bitacora_reclamaciones;
create trigger bitacora_normaliza_tr
  before insert or update on public.bitacora_reclamaciones
  for each row execute function public.bitacora_bitacora_normaliza();

-- Al dejar una nota, la reclamación queda "tocada": así el listado puede
-- ordenarse por movimiento real y no por la última vez que alguien cambió un
-- campo.
create or replace function public.bitacora_nota_toca()
returns trigger
language plpgsql
as $$
begin
  update public.bitacora_reclamaciones
     set actualizado_en = now(),
         fecha_actualizacion = greatest(coalesce(fecha_actualizacion, new.fecha), new.fecha)
   where id = new.reclamacion_id;
  return new;
end;
$$;

drop trigger if exists bitacora_nota_toca_tr on public.bitacora_notas;
create trigger bitacora_nota_toca_tr
  after insert on public.bitacora_notas
  for each row execute function public.bitacora_nota_toca();

-- --------------------------------------------------------------------------
-- 4. Permisos
-- --------------------------------------------------------------------------
-- Proceso interno: lo trabajan reclamaciones y admin; los demás roles internos
-- consultan; el rol "empresa" no lo ve ni de lejos.
alter table public.bitacora_reclamaciones      enable row level security;
alter table public.bitacora_notas  enable row level security;

drop policy if exists bitacora_escribe on public.bitacora_reclamaciones;
create policy bitacora_escribe on public.bitacora_reclamaciones
  for all to authenticated
  using (rol_actual() in ('admin', 'reclamaciones'))
  with check (rol_actual() in ('admin', 'reclamaciones'));

drop policy if exists bitacora_consulta on public.bitacora_reclamaciones;
create policy bitacora_consulta on public.bitacora_reclamaciones
  for select to authenticated
  using (rol_actual() is not null and rol_actual() <> 'empresa');

drop policy if exists bitacora_notas_escribe on public.bitacora_notas;
create policy bitacora_notas_escribe on public.bitacora_notas
  for all to authenticated
  using (rol_actual() in ('admin', 'reclamaciones'))
  with check (rol_actual() in ('admin', 'reclamaciones'));

drop policy if exists bitacora_notas_consulta on public.bitacora_notas;
create policy bitacora_notas_consulta on public.bitacora_notas
  for select to authenticated
  using (rol_actual() is not null and rol_actual() <> 'empresa');
