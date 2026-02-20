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
      // CSRF トークンを取得
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

/** Scrapbox からCSRFトークン (connect.sid cookie で認証済みページを取得) */
async function fetchCsrfToken(env: Env): Promise<string> {
  const url = `https://scrapbox.io/api/pages/${env.SCRAPBOX_PROJECT}?limit=1`;
  const res = await fetch(url, {
    headers: {
      Cookie: `connect.sid=${env.SCRAPBOX_SID}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch CSRF token: ${res.status}`);
  }
  const token = res.headers.get("x-csrftoken");
  if (!token) {
    // トークンがなくてもインポートできる場合があるので空文字を返す
    return "";
  }
  return token;
}

/** Scrapbox Import API にページをPOST */
async function importPage(
  env: Env,
  body: ImportBody,
  csrfToken: string,
): Promise<void> {
  const url = `https://scrapbox.io/api/page-data/import/${env.SCRAPBOX_PROJECT}.json`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=utf-8",
    Cookie: `connect.sid=${env.SCRAPBOX_SID}`,
  };
  if (csrfToken) {
    headers["X-CSRF-TOKEN"] = csrfToken;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
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
