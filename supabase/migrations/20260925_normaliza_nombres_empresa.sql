-- Normaliza los nombres de empresa en las CUATRO tablas a la vez.
--
-- Tiene que ser atómico. La RLS compara por igualdad exacta:
--     empresa_select_asistencias:  (datos->>'EMPRESA') = empresa_actual()
--     empresa_select_parque:       empresa = empresa_actual()
-- donde empresa_actual() sale de perfiles.empresa. Si se renombraran los casos
-- sin renombrar los perfiles, el usuario de esa empresa dejaría de ver TODO.
--
-- Solo se corrige la ESCRITURA. No se fusiona ninguna empresa:
--   · COOINVETRANS e INVETRANS se verificaron y no comparten ni una placa
--     (31 y 28 vehículos, flotas disjuntas): son empresas distintas.
--   · Los cuatro RUIZ MORENO (Diego León, Gloria Inés, Luz Amparo, Patricia
--     Elena) son propietarios personas naturales con flotas propias.
--
-- Para revertir: correr el mismo bloque con los pares al revés.

begin;

create temporary table _nombres(viejo text primary key, nuevo text not null) on commit drop;
insert into _nombres(viejo, nuevo) values
  ('Cootransi',                        'COOTRANSI'),                              -- escrito en minúsculas al crear el caso
  ('COOTRANSPINAl',                    'COOTRANSPINAL'),                          -- la ele final quedó en minúscula
  ('TRANSPORTES RAPIDO SAN CRISTOBAL', 'TRANSPORTES RAPIDO SAN CRISTOBAL SAS');   -- le faltaba la forma jurídica

update public.registro_asistencias a
   set datos = a.datos || jsonb_build_object('EMPRESA', n.nuevo)
  from _nombres n
 where a.datos->>'EMPRESA' = n.viejo;

update public.registro_terceros t
   set datos = t.datos || jsonb_build_object('EMPRESA SINIESTRO', n.nuevo)
  from _nombres n
 where t.datos->>'EMPRESA SINIESTRO' = n.viejo;

update public.parque_automotor p
   set empresa = n.nuevo
  from _nombres n
 where p.empresa = n.viejo;

update public.perfiles pf
   set empresa = n.nuevo
  from _nombres n
 where pf.empresa = n.viejo;

commit;
