interface Env {
  API_TOKEN: string;
  SCRAPBOX_PROJECT: string;
  SCRAPBOX_SID: string;
}

interface ImportPage {
  title: string;
  lines: string[];
}

interface ImportBody {
  pages: ImportPage[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Bearer token 認証
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.API_TOKEN}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let text: string;
    try {
      const body = (await request.json()) as { text?: string };
      if (!body.text || typeof body.text !== "string") {
        return jsonResponse({ error: "Missing or invalid 'text' field" }, 400);
      }
      text = body.text;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const title = generateTitle();
    const lines = [title, ...text.split("\n")];

    try {
      // /api/users/me からCSRFトークンを取得
      const csrfToken = await fetchCsrfToken(env);

      // Import API でページ作成
      await importPage(env, { pages: [{ title, lines }] }, csrfToken);

      return jsonResponse({ ok: true, title });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return jsonResponse({ error: message }, 502);
    }
  },
};

/** JST で メモ_YYYY-MM-DD_HHmm 形式のタイトルを生成 */
function generateTitle(): string {
  const now = new Date();
  // UTC+9 で JST を計算
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `メモ_${y}-${mo}-${d}_${h}${mi}`;
}

/** /api/users/me からCSRFトークンを取得 */
async function fetchCsrfToken(env: Env): Promise<string> {
  const res = await fetch("https://scrapbox.io/api/users/me", {
    headers: {
      Cookie: `connect.sid=${env.SCRAPBOX_SID}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch CSRF token: ${res.status}`);
  }
  const data = (await res.json()) as { csrfToken?: string };
  if (!data.csrfToken) {
    throw new Error("csrfToken not found in /api/users/me response");
  }
  return data.csrfToken;
}

/** Scrapbox Import API にページをPOST (multipart/form-data) */
async function importPage(
  env: Env,
  body: ImportBody,
  csrfToken: string,
): Promise<void> {
  const url = `https://scrapbox.io/api/page-data/import/${env.SCRAPBOX_PROJECT}.json`;
  const json = JSON.stringify(body);
  const file = new File([json], "import.json", {
    type: "application/json",
  });
  const formData = new FormData();
  formData.append("import-file", file);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: `connect.sid=${env.SCRAPBOX_SID}`,
      "X-CSRF-TOKEN": csrfToken,
    },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import API error ${res.status}: ${text}`);
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
