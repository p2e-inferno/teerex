import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCspReports, readJsonWithLimit, resolveClientIp } from "./report.ts";

Deno.test("normalizeCspReports reads legacy csp-report payloads", () => {
  const reports = normalizeCspReports({
    "csp-report": {
      "document-uri": "https://teerex.live/event/123",
      "violated-directive": "script-src",
      "blocked-uri": "https://example.test/script.js",
      "source-file": "https://teerex.live/assets/app.js",
      "line-number": "12",
      "column-number": 4,
      "status-code": "200",
    },
  });

  assertEquals(reports.length, 1);
  assertEquals(reports[0].documentUri, "https://teerex.live/event/123");
  assertEquals(reports[0].violatedDirective, "script-src");
  assertEquals(reports[0].blockedUri, "https://example.test/script.js");
  assertEquals(reports[0].sourceFile, "https://teerex.live/assets/app.js");
  assertEquals(reports[0].lineNumber, 12);
  assertEquals(reports[0].columnNumber, 4);
  assertEquals(reports[0].statusCode, 200);
});

Deno.test("normalizeCspReports reads Reporting API arrays", () => {
  const reports = normalizeCspReports([
    {
      type: "csp-violation",
      body: {
        documentURL: "https://teerex.live/profile",
        effectiveDirective: "connect-src",
        blockedURL: "https://blocked.example",
        sourceFile: "https://teerex.live/assets/index.js",
        lineNumber: 8,
      },
    },
    {
      type: "network-error",
      body: {
        documentURL: "https://teerex.live",
        effectiveDirective: "img-src",
      },
    },
  ]);

  assertEquals(reports.length, 1);
  assertEquals(reports[0].documentUri, "https://teerex.live/profile");
  assertEquals(reports[0].violatedDirective, "connect-src");
  assertEquals(reports[0].blockedUri, "https://blocked.example");
  assertEquals(reports[0].lineNumber, 8);
});

Deno.test("normalizeCspReports reads direct report payloads", () => {
  const reports = normalizeCspReports({
    documentURL: "https://teerex.live/ticket-passes",
    effectiveDirective: "frame-src",
    blockedURL: "https://blocked.example/frame",
  });

  assertEquals(reports.length, 1);
  assertEquals(reports[0].documentUri, "https://teerex.live/ticket-passes");
  assertEquals(reports[0].violatedDirective, "frame-src");
  assertEquals(reports[0].blockedUri, "https://blocked.example/frame");
});

Deno.test("normalizeCspReports rejects incomplete payloads", () => {
  assertEquals(normalizeCspReports({ "csp-report": { "document-uri": "https://teerex.live" } }), []);
  assertEquals(normalizeCspReports({ effectiveDirective: "img-src" }), []);
  assertEquals(normalizeCspReports(null), []);
});

Deno.test("readJsonWithLimit returns invalid_json for malformed JSON", async () => {
  const result = await readJsonWithLimit(new Request("https://teerex.live", {
    method: "POST",
    body: "{not-json",
  }));

  assertEquals(result, { ok: false, reason: "invalid_json" });
});

Deno.test("readJsonWithLimit returns empty for blank bodies", async () => {
  const result = await readJsonWithLimit(new Request("https://teerex.live", {
    method: "POST",
    body: "   ",
  }));

  assertEquals(result, { ok: false, reason: "empty" });
});

Deno.test("readJsonWithLimit rejects oversized bodies", async () => {
  const result = await readJsonWithLimit(new Request("https://teerex.live", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(64) }),
  }), 16);

  assertEquals(result, { ok: false, reason: "too_large" });
});

Deno.test("resolveClientIp prefers the first forwarded address", () => {
  const result = resolveClientIp(new Request("https://teerex.live", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 198.51.100.4",
      "cf-connecting-ip": "198.51.100.5",
      "x-real-ip": "198.51.100.6",
    },
  }));

  assertEquals(result, "203.0.113.10");
});

Deno.test("resolveClientIp falls back to edge IP headers", () => {
  assertEquals(resolveClientIp(new Request("https://teerex.live", {
    headers: { "cf-connecting-ip": "198.51.100.5" },
  })), "198.51.100.5");

  assertEquals(resolveClientIp(new Request("https://teerex.live", {
    headers: { "x-real-ip": "198.51.100.6" },
  })), "198.51.100.6");
});
