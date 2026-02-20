import { describe, it, expect, vi, beforeEach } from "vitest";
import worker, { generateTitle } from "./index";

const env = {
  API_TOKEN: "test-token",
  SCRAPBOX_PROJECT: "test-project",
  SCRAPBOX_SID: "test-sid",
};

function post(body: unknown, token = "test-token"): Request {
  return new Request("https://example.com/memo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("generateTitle", () => {
  it("メモ_YYYY-MM-DD_HHmm 形式のJSTタイトルを生成する", () => {
    vi.useFakeTimers();
    // 2025-01-15T05:30:00Z = 2025-01-15T14:30:00 JST
    vi.setSystemTime(new Date("2025-01-15T05:30:00Z"));

    expect(generateTitle()).toBe("メモ_2025-01-15_1430");

    vi.useRealTimers();
  });

  it("日付・時刻をゼロパディングする", () => {
    vi.useFakeTimers();
    // 2025-03-05T00:05:00Z = 2025-03-05T09:05:00 JST
    vi.setSystemTime(new Date("2025-03-05T00:05:00Z"));

    expect(generateTitle()).toBe("メモ_2025-03-05_0905");

    vi.useRealTimers();
  });
});

describe("worker.fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET は 405 を返す", async () => {
    const req = new Request("https://example.com/", { method: "GET" });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(405);
  });

  it("OPTIONS は 204 を返す", async () => {
    const req = new Request("https://example.com/", { method: "OPTIONS" });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(204);
  });

  it("不正なトークンで 401 を返す", async () => {
    const res = await worker.fetch(post({ text: "hello" }, "wrong"), env);
    expect(res.status).toBe(401);
  });

  it("text フィールドがないと 400 を返す", async () => {
    const res = await worker.fetch(post({}), env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("text");
  });

  it("不正なJSONで 400 を返す", async () => {
    const req = new Request("https://example.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: "not json",
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("正常系: Scrapbox API をモックしてページ作成に成功する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // /api/users/me のモック
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "csrf-123" }), { status: 200 }),
    );

    // Import API のモック
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await worker.fetch(post({ text: "テスト投稿" }), env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.title).toMatch(/^メモ_\d{4}-\d{2}-\d{2}_\d{4}$/);

    // /api/users/me が正しく呼ばれたか
    const csrfCall = fetchSpy.mock.calls[0];
    expect(csrfCall[0]).toBe("https://scrapbox.io/api/users/me");

    // Import API が正しく呼ばれたか
    const importCall = fetchSpy.mock.calls[1];
    expect(importCall[0]).toBe(
      "https://scrapbox.io/api/page-data/import/test-project.json",
    );
    const importInit = importCall[1] as RequestInit;
    expect(importInit.method).toBe("POST");
    expect((importInit.headers as Record<string, string>)["X-CSRF-TOKEN"]).toBe(
      "csrf-123",
    );
    // multipart/form-data で送信されたことを確認
    expect(importInit.body).toBeInstanceOf(FormData);
  });

  it("CSRF取得失敗時に 502 を返す", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("error", { status: 500 }));

    const res = await worker.fetch(post({ text: "test" }), env);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("CSRF");
  });

  it("Import API 失敗時に 502 を返す", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "csrf-123" }), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    );

    const res = await worker.fetch(post({ text: "test" }), env);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Import API error 403");
  });

  it("本文に #未整理 タグが付与される", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "csrf-123" }), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await worker.fetch(post({ text: "hello" }), env);

    const importCall = fetchSpy.mock.calls[1];
    const importInit = importCall[1] as RequestInit;
    const formData = importInit.body as FormData;
    const file = formData.get("import-file") as File;
    const json = JSON.parse(await file.text());
    const lines: string[] = json.pages[0].lines;
    expect(lines[lines.length - 1]).toBe("#未整理");
  });
});
