export const MAX_BODY_BYTES = 32_768;

export const RATE_LIMIT = {
  windowSeconds: 60,
  max: 5,
} as const;

export type NormalizedReport = {
  documentUri: string;
  violatedDirective: string;
  blockedUri: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  statusCode: number | null;
  raw: unknown;
};

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "empty" | "invalid_json" | "too_large" };

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length ? s : null;
}

function fromLegacy(report: Record<string, unknown>): NormalizedReport | null {
  const documentUri = toStringOrNull(report["document-uri"] ?? report.documentUri);
  const violatedDirective = toStringOrNull(
    report["violated-directive"] ??
      report.violatedDirective ??
      report["effective-directive"],
  );

  if (!documentUri || !violatedDirective) return null;

  return {
    documentUri,
    violatedDirective,
    blockedUri: toStringOrNull(report["blocked-uri"] ?? report.blockedUri),
    sourceFile: toStringOrNull(report["source-file"] ?? report.sourceFile),
    lineNumber: toIntOrNull(report["line-number"] ?? report.lineNumber),
    columnNumber: toIntOrNull(report["column-number"] ?? report.columnNumber),
    statusCode: toIntOrNull(report["status-code"] ?? report.statusCode),
    raw: report,
  };
}

function fromReportingApi(body: Record<string, unknown>): NormalizedReport | null {
  const documentUri = toStringOrNull(body.documentURL ?? body["document-uri"]);
  const violatedDirective = toStringOrNull(
    body.effectiveDirective ??
      body.violatedDirective ??
      body["violated-directive"],
  );

  if (!documentUri || !violatedDirective) return null;

  return {
    documentUri,
    violatedDirective,
    blockedUri: toStringOrNull(body.blockedURL ?? body["blocked-uri"]),
    sourceFile: toStringOrNull(body.sourceFile ?? body["source-file"]),
    lineNumber: toIntOrNull(body.lineNumber ?? body["line-number"]),
    columnNumber: toIntOrNull(body.columnNumber ?? body["column-number"]),
    statusCode: toIntOrNull(body.statusCode ?? body["status-code"]),
    raw: body,
  };
}

export function normalizeCspReports(parsed: unknown): NormalizedReport[] {
  if (Array.isArray(parsed)) {
    const reports: NormalizedReport[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const event = entry as Record<string, unknown>;
      if (event.type && event.type !== "csp-violation" && event.type !== "csp") {
        continue;
      }
      const body = (event.body ?? event) as Record<string, unknown>;
      const report = fromReportingApi(body);
      if (report) reports.push(report);
    }

    return reports;
  }

  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const legacy = obj["csp-report"];
  if (legacy && typeof legacy === "object") {
    const report = fromLegacy(legacy as Record<string, unknown>);
    return report ? [report] : [];
  }

  const report = fromReportingApi(obj) ?? fromLegacy(obj);
  return report ? [report] : [];
}

export async function readJsonWithLimit(
  req: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<JsonReadResult> {
  if (!req.body) return { ok: false, reason: "empty" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  if (size === 0) return { ok: false, reason: "empty" };

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const raw = new TextDecoder().decode(bytes).trim();
  if (!raw) return { ok: false, reason: "empty" };

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function resolveClientIp(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
}
