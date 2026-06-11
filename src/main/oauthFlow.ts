import { shell } from "electron";
import crypto from "node:crypto";
import http from "node:http";
import { requestJson } from "./httpClient";

export interface GmailRefreshTokenInput {
  clientId: string;
  clientSecret?: string;
}

export interface GmailRefreshTokenResult {
  email: string;
  refreshToken: string;
  accessToken: string;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function parseJsonText(text: string, fallback: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error_description: text || fallback };
  }
}

function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.text().then((text) => {
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { error_description: text || response.statusText };
    }
  });
}

async function exchangeCode(input: GmailRefreshTokenInput, code: string, redirectUri: string, verifier: string) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  if (input.clientSecret?.trim()) {
    body.set("client_secret", input.clientSecret.trim());
  }

  const response = await requestJson({
    method: "POST",
    url: "https://oauth2.googleapis.com/token",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const payload = response.body;
  if (!response.ok) {
    throw new Error(String(payload.error_description ?? payload.error ?? response.statusMessage ?? "授权码换取 token 失败"));
  }
  if (typeof payload.refresh_token !== "string" || typeof payload.access_token !== "string") {
    throw new Error("Google 没有返回 refresh_token，请重新授权并确认使用的是测试用户账号");
  }
  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token
  };
}

async function fetchGmailEmail(accessToken: string): Promise<string> {
  try {
    const response = await requestJson({
      method: "GET",
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return typeof response.body.emailAddress === "string" ? response.body.emailAddress : "";
  } catch {
    return "";
  }
}

export function generateGmailRefreshToken(input: GmailRefreshTokenInput): Promise<GmailRefreshTokenResult> {
  if (!input.clientId.trim()) {
    return Promise.reject(new Error("client_id 不能为空"));
  }

  return new Promise((resolve, reject) => {
    const { verifier, challenge } = createPkcePair();
    const server = http.createServer();
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("授权超时，请重新点击生成 RF"));
    }, 180000);

    server.on("request", (request, response) => {
      void (async () => {
        try {
          const host = request.headers.host ?? "";
          const requestUrl = new URL(request.url ?? "/", `http://${host}`);
          const code = requestUrl.searchParams.get("code");
          const error = requestUrl.searchParams.get("error");

          if (error) {
            throw new Error(error);
          }
          if (!code) {
            response.writeHead(404);
            response.end("Not found");
            return;
          }

          const redirectUri = `http://${host}/oauth/google/callback`;
          const token = await exchangeCode(input, code, redirectUri, verifier);
          const email = await fetchGmailEmail(token.accessToken);

          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end("<h2>授权完成，可以回到邮迹。</h2>");
          clearTimeout(timeout);
          server.close();
          resolve({
            email,
            refreshToken: token.refreshToken,
            accessToken: token.accessToken
          });
        } catch (error) {
          response.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          response.end("<h2>授权失败，请回到软件查看错误。</h2>");
          clearTimeout(timeout);
          server.close();
          reject(error);
        }
      })();
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timeout);
        server.close();
        reject(new Error("无法启动本地 OAuth 回调服务"));
        return;
      }

      const redirectUri = `http://127.0.0.1:${address.port}/oauth/google/callback`;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", input.clientId.trim());
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      void shell.openExternal(authUrl.toString());
    });
  });
}
