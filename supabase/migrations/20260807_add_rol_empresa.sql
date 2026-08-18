-- Rol "empresa": login autogestionable por compañía transportadora.
-- Ve solo su parque automotor y su historial de casos (registro_asistencias),
-- sin acceso a ningún otro dato ni panel administrativo.

-- 1) Columna que vincula el perfil con una compañía de parque_automotor.
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS empresa text;

-- 1b) El CHECK de rol solo permitía los 5 roles internos originales: sin este
--     paso, cualquier upsert con rol='empresa' falla en silencio (el código
--     que llama upsert() no revisaba el error) y el perfil queda con el rol
--     default en vez de 'empresa'.
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check
  CHECK (rol = ANY (ARRAY['gestor','asistente','admin','reclamaciones','seguridad_vial','empresa']));

-- 2) Helper para leer la empresa del usuario autenticado (mismo estilo que rol_actual()).
CREATE OR REPLACE FUNCTION public.empresa_actual()
 RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select empresa from public.perfiles where id = auth.uid();
$function$;

-- 3) Acceso permitido: parque_automotor y registro_asistencias, filtrados por empresa.
ALTER POLICY auth_all_parque ON parque_automotor
  USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
CREATE POLICY empresa_select_parque ON parque_automotor
  FOR SELECT USING (rol_actual() = 'empresa' AND empresa = empresa_actual());

ALTER POLICY reg_asis_select ON registro_asistencias
  USING (rol_actual() <> 'empresa');
CREATE POLICY empresa_select_asistencias ON registro_asistencias
  FOR SELECT USING (rol_actual() = 'empresa' AND (datos->>'EMPRESA') = empresa_actual());

-- 4) Defensa en profundidad: excluir 'empresa' del resto de tablas internas
--    (aunque la UI no las muestre, la API de Supabase no debe entregarlas).
ALTER POLICY auth_all_calendario         ON calendario         USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_datos_empresa      ON datos_empresa      USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_ocupantes          ON ocupantes          USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_polizas            ON polizas            USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_preoperacionales   ON preoperacionales   USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_reclamaciones      ON reclamaciones      USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY auth_all_vehiculos_terceros ON vehiculos_terceros USING (rol_actual() <> 'empresa') WITH CHECK (rol_actual() <> 'empresa');
ALTER POLICY reg_ter_select              ON registro_terceros  USING (rol_actual() <> 'empresa');
ALTER POLICY leer_casos_autenticados     ON firma_cases        USING (rol_actual() <> 'empresa');
ALTER POLICY perfil_select_todos         ON perfiles           USING (rol_actual() <> 'empresa');
