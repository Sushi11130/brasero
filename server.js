const fs = require("fs/promises");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const publicDir = path.join(__dirname, "public");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleAdminResetPassword(request, response) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    sendJson(response, 500, { error: "Ajoute SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY pour tester cette route en local." });
    return;
  }

  if (!token) {
    sendJson(response, 401, { error: "Session admin manquante." });
    return;
  }

  const body = await readJsonBody(request);
  if (!body.userId || !body.password || body.password.length < 6) {
    sendJson(response, 400, { error: "Utilisateur et nouveau mot de passe obligatoires." });
    return;
  }

  const currentUserResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY
    }
  });

  if (!currentUserResponse.ok) {
    sendJson(response, 401, { error: "Session invalide." });
    return;
  }

  const currentUser = await currentUserResponse.json();
  const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${currentUser.id}&select=role`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const profiles = await profileResponse.json();

  if (!profiles[0] || profiles[0].role !== "admin") {
    sendJson(response, 403, { error: "Reserve aux admins." });
    return;
  }

  const updateResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: body.password })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.json().catch(() => ({}));
    sendJson(response, updateResponse.status, { error: error.msg || error.message || "Supabase a refuse le changement." });
    return;
  }

  sendJson(response, 200, { ok: true });
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ""));
  const filePath = path.resolve(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Acces refuse." });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Introuvable." });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url.startsWith("/api/admin-reset-password")) {
      await handleAdminResetPassword(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Erreur serveur." });
  }
});

server.listen(PORT, () => {
  console.log(`Brasero tourne sur http://localhost:${PORT}`);
});
