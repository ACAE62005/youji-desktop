import tls from "node:tls";
import { extractCode, normalizeSnippet } from "./codeExtractor";
import { requestJson } from "./httpClient";
import type { MailResult, OAuthCheckResult, Provider, SearchInput } from "./types";

interface TokenResult {
  accessToken: string;
  refreshToken?: string;
}

interface ProviderCredentials {
  email: string;
  password?: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  provider: Provider;
}

interface ImapMessage {
  subject: string;
  from: string;
  date: string;
  text: string;
}

function oauthError(payload: Record<string, unknown>, fallback: string): string {
  return String(payload.error_description ?? payload.error ?? payload.message ?? fallback);
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function postToken(url: string, params: URLSearchParams, timeoutMs: number): Promise<TokenResult> {
  const response = await requestJson({
    method: "POST",
    url,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    timeoutMs
  });
  const payload = response.body;

  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(oauthError(payload, "无法刷新访问令牌"));
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined
  };
}

async function refreshGmailToken(credentials: ProviderCredentials, timeoutMs: number): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken
  });
  if (credentials.clientSecret?.trim()) {
    params.set("client_secret", credentials.clientSecret.trim());
  }

  return postToken(
    "https://oauth2.googleapis.com/token",
    params,
    timeoutMs
  );
}

async function refreshOutlookToken(credentials: ProviderCredentials, timeoutMs: number): Promise<TokenResult> {
  const endpoint = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
  const scoped = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    refresh_token: credentials.refreshToken,
    scope: "offline_access https://graph.microsoft.com/Mail.Read"
  });

  try {
    return await postToken(endpoint, scoped, timeoutMs);
  } catch (firstError) {
    const unscoped = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      refresh_token: credentials.refreshToken
    });
    try {
      return await postToken(endpoint, unscoped, timeoutMs);
    } catch {
      throw firstError;
    }
  }
}

export async function refreshAccessToken(credentials: ProviderCredentials, timeoutMs: number): Promise<TokenResult> {
  if (credentials.provider === "gmail") {
    return refreshGmailToken(credentials, timeoutMs);
  }
  if (credentials.provider === "outlook") {
    return refreshOutlookToken(credentials, timeoutMs);
  }
  throw new Error("暂不支持该邮箱类型");
}

function gmailHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function escapeImapString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_match, charset: string, encoding: string, content: string) => {
    try {
      const bytes =
        encoding.toLowerCase() === "b"
          ? Buffer.from(content, "base64")
          : Buffer.from(content.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_hexMatch: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return content;
    }
  });
}

function parseHeaderMap(rawHeaders: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = rawHeaders.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index <= 0) {
      continue;
    }
    map.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  return map;
}

function charsetFromContentType(contentType: string): string {
  return contentType.match(/charset="?([^";\s]+)"?/i)?.[1] ?? "utf-8";
}

function decodeQuotedPrintable(value: string, charset: string): string {
  const binary = value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  try {
    return new TextDecoder(charset).decode(Buffer.from(binary, "binary"));
  } catch {
    return binary;
  }
}

function decodeTransferBody(value: string, transferEncoding: string, charset: string): string {
  const encoding = transferEncoding.toLowerCase();
  if (encoding.includes("base64")) {
    try {
      return new TextDecoder(charset).decode(Buffer.from(value.replace(/\s+/g, ""), "base64"));
    } catch {
      return value;
    }
  }
  if (encoding.includes("quoted-printable")) {
    return decodeQuotedPrintable(value, charset);
  }
  return value;
}

function extractMultipartText(body: string, contentType: string): string | null {
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) {
    return null;
  }

  const parts = body.split(`--${boundary}`);
  const decodedParts = parts
    .map((part) => {
      const splitIndex = part.search(/\r?\n\r?\n/);
      if (splitIndex < 0) {
        return null;
      }
      const headers = parseHeaderMap(part.slice(0, splitIndex).trim());
      const partBody = part.slice(splitIndex).replace(/^\r?\n\r?\n/, "").trim();
      const partContentType = headers.get("content-type") ?? "text/plain; charset=utf-8";
      if (!/^text\/(plain|html)/i.test(partContentType)) {
        return null;
      }
      return {
        isPlain: /^text\/plain/i.test(partContentType),
        text: decodeTransferBody(partBody, headers.get("content-transfer-encoding") ?? "", charsetFromContentType(partContentType))
      };
    })
    .filter((part): part is { isPlain: boolean; text: string } => Boolean(part));

  return decodedParts.find((part) => part.isPlain)?.text ?? decodedParts[0]?.text ?? null;
}

function parseRawEmail(raw: string): ImapMessage {
  const splitIndex = raw.search(/\r?\n\r?\n/);
  const rawHeaders = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const rawBody = splitIndex >= 0 ? raw.slice(splitIndex).replace(/^\r?\n\r?\n/, "") : "";
  const headers = parseHeaderMap(rawHeaders);
  const contentType = headers.get("content-type") ?? "text/plain; charset=utf-8";
  const bodyText =
    extractMultipartText(rawBody, contentType) ??
    decodeTransferBody(rawBody, headers.get("content-transfer-encoding") ?? "", charsetFromContentType(contentType));

  return {
    subject: decodeMimeWords(headers.get("subject") ?? ""),
    from: decodeMimeWords(headers.get("from") ?? ""),
    date: headers.get("date") ?? "",
    text: bodyText
  };
}

function extractImapFetchBodies(response: string): string[] {
  const blocks = response.match(/(?:^|\r?\n)\* \d+ FETCH [\s\S]*?(?=\r?\n\* \d+ FETCH |\r?\nA\d+ (?:OK|NO|BAD)|$)/g) ?? [];
  return blocks
    .map((block) => {
      const literalStart = block.match(/\{\d+\}\r?\n/);
      if (!literalStart?.index && literalStart?.index !== 0) {
        return "";
      }
      return block
        .slice(literalStart.index + literalStart[0].length)
        .replace(/\r?\n\)\s*$/, "")
        .trim();
    })
    .filter(Boolean);
}

class ImapConnection {
  private buffer = "";
  private tagIndex = 0;

  constructor(private readonly socket: tls.TLSSocket, private readonly timeoutMs: number) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.buffer += String(chunk);
    });
  }

  waitForGreeting(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (this.buffer.includes("\r\n")) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - startedAt > this.timeoutMs) {
          clearInterval(timer);
          reject(new Error("QQ 邮箱 IMAP 连接超时"));
        }
      }, 30);
    });
  }

  command(command: string): Promise<string> {
    const tag = `A${String(++this.tagIndex).padStart(4, "0")}`;
    this.buffer = "";
    this.socket.write(`${tag} ${command}\r\n`);

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const done = this.buffer.match(new RegExp(`(?:^|\\r?\\n)${tag} (OK|NO|BAD)[^\\r\\n]*`, "i"));
        if (done) {
          clearInterval(timer);
          const response = this.buffer;
          if (done[1].toUpperCase() === "OK") {
            resolve(response);
          } else {
            reject(new Error(`QQ 邮箱 IMAP 命令失败：${done[0].trim()}`));
          }
          return;
        }
        if (Date.now() - startedAt > this.timeoutMs) {
          clearInterval(timer);
          reject(new Error("QQ 邮箱 IMAP 读取超时"));
        }
      }, 30);
    });
  }

  close(): void {
    this.socket.end();
  }
}

async function connectImap(host: string, timeoutMs: number): Promise<ImapConnection> {
  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const client = tls.connect({ host, port: 993, servername: host }, () => resolve(client));
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("QQ 邮箱 IMAP 连接超时"));
    }, timeoutMs);
    client.once("secureConnect", () => clearTimeout(timer));
    client.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`QQ 邮箱 IMAP 连接失败：${error.message}`));
    });
  });

  const connection = new ImapConnection(socket, timeoutMs);
  await connection.waitForGreeting();
  return connection;
}

async function fetchGmailMessages(
  credentials: ProviderCredentials,
  accessToken: string,
  input: SearchInput,
  timeoutMs: number
): Promise<MailResult[]> {
  const limit = Math.max(1, Math.min(input.limit, 50));
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(limit));
  listUrl.searchParams.set("includeSpamTrash", String(input.includeSpamOrJunk));
  if (input.keyword.trim()) {
    listUrl.searchParams.set("q", input.keyword.trim());
  }

  const listResponse = await requestJson({
    method: "GET",
    url: listUrl.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs
  });
  const listPayload = listResponse.body;
  if (!listResponse.ok) {
    throw new Error(oauthError(listPayload, "Gmail 邮件列表读取失败"));
  }

  const messages = Array.isArray(listPayload.messages) ? listPayload.messages : [];
  const results: MailResult[] = [];

  for (const message of messages.slice(0, limit) as Array<{ id?: string }>) {
    if (!message.id) {
      continue;
    }

    const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`);
    messageUrl.searchParams.set("format", "metadata");
    messageUrl.searchParams.append("metadataHeaders", "Subject");
    messageUrl.searchParams.append("metadataHeaders", "From");
    messageUrl.searchParams.append("metadataHeaders", "Date");

    const detailResponse = await requestJson({
      method: "GET",
      url: messageUrl.toString(),
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs
    });
    if (!detailResponse.ok) {
      continue;
    }

    const detail = detailResponse.body;
    const headers = ((detail.payload as { headers?: Array<{ name: string; value: string }> } | undefined)?.headers ?? []);
    const subject = gmailHeader(headers, "Subject");
    const from = gmailHeader(headers, "From");
    const receivedAt = gmailHeader(headers, "Date");
    const snippet = normalizeSnippet(String(detail.snippet ?? ""));
    const combined = `${subject} ${snippet}`;

    results.push({
      email: credentials.email,
      provider: "gmail",
      subject,
      from,
      receivedAt,
      code: extractCode(combined),
      snippet
    });
  }

  return results;
}

async function fetchOutlookMessages(
  credentials: ProviderCredentials,
  accessToken: string,
  input: SearchInput,
  timeoutMs: number
): Promise<MailResult[]> {
  const limit = Math.max(1, Math.min(input.limit, 50));
  const keyword = input.keyword.trim().toLocaleLowerCase();
  const requestLimit = keyword ? Math.min(Math.max(limit * 5, 25), 50) : limit;
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(requestLimit));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$select", "subject,from,receivedDateTime,bodyPreview");

  const response = await requestJson({
    method: "GET",
    url: url.toString(),
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeoutMs
  });
  const payload = response.body;
  if (!response.ok) {
    throw new Error(oauthError(payload, "Outlook 邮件读取失败"));
  }

  const messages = Array.isArray(payload.value) ? payload.value : [];
  return (messages as Array<Record<string, unknown>>)
    .map((message) => {
      const subject = String(message.subject ?? "");
      const from =
        ((message.from as { emailAddress?: { address?: string; name?: string } } | undefined)?.emailAddress?.address ??
          (message.from as { emailAddress?: { name?: string } } | undefined)?.emailAddress?.name ??
          "") || "";
      const snippet = normalizeSnippet(String(message.bodyPreview ?? ""));
      const combined = `${subject} ${from} ${snippet}`;

      return {
        email: credentials.email,
        provider: "outlook" as const,
        subject,
        from,
        receivedAt: String(message.receivedDateTime ?? ""),
        code: extractCode(combined),
        snippet
      };
    })
    .filter((mail) => {
      if (!keyword) {
        return true;
      }
      return `${mail.subject} ${mail.from} ${mail.snippet}`.toLocaleLowerCase().includes(keyword);
    })
    .slice(0, limit);
}

async function fetchQqMessages(credentials: ProviderCredentials, input: SearchInput, timeoutMs: number): Promise<MailResult[]> {
  const password = credentials.password?.trim();
  if (!password) {
    throw new Error("缺少 QQ 邮箱授权码，请使用 qq邮箱----授权码 导入");
  }

  const limit = Math.max(1, Math.min(input.limit, 50));
  const keyword = input.keyword.trim().toLocaleLowerCase();
  const requestLimit = keyword ? Math.min(Math.max(limit * 5, 25), 50) : limit;
  const connection = await connectImap("imap.qq.com", timeoutMs);

  try {
    await connection.command(`LOGIN ${escapeImapString(credentials.email)} ${escapeImapString(password)}`);
    await connection.command("SELECT INBOX");
    const searchResponse = await connection.command("UID SEARCH ALL");
    const uids =
      searchResponse
        .match(/\* SEARCH ([^\r\n]*)/i)?.[1]
        ?.trim()
        .split(/\s+/)
        .filter(Boolean) ?? [];

    if (uids.length === 0) {
      return [];
    }

    const latestUids = uids.slice(-requestLimit).reverse();
    const fetchResponse = await connection.command(`UID FETCH ${latestUids.join(",")} (BODY.PEEK[]<0.12288>)`);
    return extractImapFetchBodies(fetchResponse)
      .map((raw) => {
        const parsed = parseRawEmail(raw);
        const snippet = normalizeSnippet(parsed.text);
        const combined = `${parsed.subject} ${parsed.from} ${snippet}`;
        return {
          email: credentials.email,
          provider: "qq" as const,
          subject: parsed.subject,
          from: parsed.from,
          receivedAt: parsed.date,
          code: extractCode(combined),
          snippet
        };
      })
      .filter((mail) => {
        if (!keyword) {
          return true;
        }
        return `${mail.subject} ${mail.from} ${mail.snippet}`.toLocaleLowerCase().includes(keyword);
      })
      .slice(0, limit);
  } catch (error) {
    const message = normalizeError(error);
    if (/LOGIN|AUTHENTICATIONFAILED|AUTHENTICATE|NO/i.test(message)) {
      throw new Error("QQ 邮箱登录失败，请确认已开启 IMAP/SMTP 服务，并使用 QQ 邮箱生成的授权码，不是 QQ 登录密码");
    }
    throw error;
  } finally {
    void connection.command("LOGOUT").catch(() => undefined);
    connection.close();
  }
}

export async function fetchProviderMessages(
  credentials: ProviderCredentials,
  input: SearchInput,
  timeoutMs: number
): Promise<MailResult[]> {
  if (credentials.provider === "qq") {
    return fetchQqMessages(credentials, input, timeoutMs);
  }
  const token = await refreshAccessToken(credentials, timeoutMs);
  if (credentials.provider === "gmail") {
    return fetchGmailMessages(credentials, token.accessToken, input, timeoutMs);
  }
  if (credentials.provider === "outlook") {
    return fetchOutlookMessages(credentials, token.accessToken, input, timeoutMs);
  }
  throw new Error("暂不支持该邮箱类型");
}

export async function checkProvider(credentials: ProviderCredentials, timeoutMs: number): Promise<OAuthCheckResult> {
  if (credentials.provider === "unknown") {
    return { ok: false, provider: "unknown", message: "暂不支持该邮箱类型，目前支持 Outlook/Hotmail、Gmail 和 QQ邮箱" };
  }

  try {
    await fetchProviderMessages(
      credentials,
      {
        accountScope: "selected",
        selectedEmails: [credentials.email],
        keyword: "",
        limit: 1,
        includeSpamOrJunk: false
      },
      timeoutMs
    );
    return { ok: true, provider: credentials.provider, message: "凭证可用，邮件读取成功" };
  } catch (error) {
    return { ok: false, provider: credentials.provider, message: normalizeError(error) };
  }
}
