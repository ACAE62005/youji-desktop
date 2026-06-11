import { net } from "electron";

export interface JsonResponse {
  ok: boolean;
  statusCode: number;
  statusMessage: string;
  body: Record<string, unknown>;
}

export function requestJson(options: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method,
      url: options.url
    });

    const timeout = setTimeout(() => {
      request.abort();
      reject(new Error("请求超时，请检查网络或调大超时时间"));
    }, options.timeoutMs ?? 20000);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      request.setHeader(key, value);
    }

    request.on("response", (response) => {
      let text = "";
      response.on("data", (chunk) => {
        text += chunk.toString();
      });
      response.on("end", () => {
        clearTimeout(timeout);
        let body: Record<string, unknown>;
        try {
          body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          body = { error_description: text || response.statusMessage };
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          body
        });
      });
    });

    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`网络请求失败：${error.message}`));
    });

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}
