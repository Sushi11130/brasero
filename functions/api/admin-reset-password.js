export async function onRequestPost(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Variables Cloudflare Supabase manquantes." }, 500);
  }

  if (!token) {
    return json({ error: "Session admin manquante." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  if (!body.userId || !body.password || body.password.length < 6) {
    return json({ error: "Utilisateur et nouveau mot de passe obligatoires." }, 400);
  }

  const currentUser = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY
    }
  }).then((response) => response.ok ? response.json() : null);

  if (!currentUser || !currentUser.id) {
    return json({ error: "Session invalide." }, 401);
  }

  const profileResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${currentUser.id}&select=role`, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const profiles = await profileResponse.json();

  if (!profiles[0] || profiles[0].role !== "admin") {
    return json({ error: "Reserve aux admins." }, 403);
  }

  const updateResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${body.userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: body.password })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.json().catch(() => ({}));
    return json({ error: error.msg || error.message || "Supabase a refuse le changement." }, updateResponse.status);
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
