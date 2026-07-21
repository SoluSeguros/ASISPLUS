// Edge Function: admin-usuarios
// Gestión de usuarios (crear, listar, cambiar contraseña, cambiar rol, eliminar).
// Solo un usuario con rol 'admin' puede ejecutarla. Usa la SERVICE ROLE KEY
// del lado del servidor (nunca se expone al navegador).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Roles válidos del sistema (incluye las áreas del desarrollo de dependencias).
const ROLES_VALIDOS = ["gestor", "asistente", "admin", "reclamaciones", "seguridad_vial"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) Verificar identidad del que llama.
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await asCaller.auth.getUser();
    if (uerr || !user) return json({ error: "No autenticado" }, 401);

    // 2) Verificar que es administrador.
    const admin = createClient(url, service);
    const { data: perfil } = await admin
      .from("perfiles").select("rol").eq("id", user.id).single();
    if (!perfil || perfil.rol !== "admin") {
      return json({ error: "Solo los administradores pueden gestionar usuarios." }, 403);
    }

    const body = await req.json();
    const action = body.action;

    if (action === "list") {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const { data: perfiles } = await admin.from("perfiles").select("id, nombre, rol");
      const mapa = new Map((perfiles ?? []).map((p: any) => [p.id, p]));
      const usuarios = (list?.users ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        rol: mapa.get(u.id)?.rol ?? "asistente",
        nombre: mapa.get(u.id)?.nombre ?? u.email,
        creado: u.created_at,
        ultimo_acceso: u.last_sign_in_at,
      }));
      return json({ usuarios });
    }

    if (action === "create") {
      const { email, password, rol, nombre } = body;
      if (!email || !password || !rol) return json({ error: "Faltan datos (correo, contraseña o rol)." }, 400);
      if (!ROLES_VALIDOS.includes(rol)) return json({ error: "Rol no válido." }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (error) return json({ error: error.message }, 400);
      await admin.from("perfiles").upsert({ id: created.user.id, nombre: nombre || email, rol });
      return json({ ok: true, id: created.user.id });
    }

    if (action === "password") {
      const { id, password } = body;
      if (!id || !password) return json({ error: "Faltan datos." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "rol") {
      const { id, rol } = body;
      if (!id || !rol) return json({ error: "Faltan datos." }, 400);
      if (!ROLES_VALIDOS.includes(rol)) return json({ error: "Rol no válido." }, 400);
      await admin.from("perfiles").upsert({ id, rol });
      return json({ ok: true });
    }

    if (action === "nombre") {
      const { id } = body;
      const nombre = (body.nombre ?? "").toString().trim();
      if (!id) return json({ error: "Falta el usuario." }, 400);
      // Actualiza solo el nombre (upsert deja intacto el rol de la fila existente).
      await admin.from("perfiles").upsert({ id, nombre: nombre || null });
      return json({ ok: true });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "Falta el usuario." }, 400);
      if (id === user.id) return json({ error: "No puedes eliminar tu propio usuario." }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
