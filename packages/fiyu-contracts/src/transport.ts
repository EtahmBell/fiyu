import type { z } from "zod";

import { describeZodIssues } from "./schemas";
import { extractDetail, FiyuApiError, kindForStatus, type FiyuErrorKind } from "./errors";
import { joinApiUrl } from "./endpoints";

export interface TokenProvider {
  getAccessToken(): Promise<string | null>;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiRawResponse {
  payload: unknown;
  status: number;
}

export interface ApiTransport {
  requestRaw(path: string, options?: ApiRequestOptions): Promise<ApiRawResponse>;
  requestJson<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: ApiRequestOptions,
  ): Promise<z.infer<TSchema>>;
}

export interface FetchTransportOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  networkKind?: () => FiyuErrorKind;
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

export function createFetchTransport({
  baseUrl,
  tokenProvider,
  fetchImplementation = fetch,
  timeoutMs = 15_000,
  networkKind = () => "network",
}: FetchTransportOptions): ApiTransport {
  const requestRaw = async (
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiRawResponse> => {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    if (!headers.Authorization && tokenProvider) {
      const token = await tokenProvider.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const hasBody = options.body !== undefined;
    if (hasBody) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetchImplementation(joinApiUrl(baseUrl, path), {
        method,
        headers,
        signal: controller.signal,
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      const timedOut = controller.signal.aborted || errorName(cause) === "TimeoutError";
      throw new FiyuApiError({
        kind: timedOut ? "timeout" : networkKind(),
        endpoint: path,
        cause,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (!response.ok) {
      let responseBody: unknown;
      let detail: string | undefined;
      try {
        responseBody = await response.json();
        detail = extractDetail(responseBody);
      } catch {
        responseBody = undefined;
      }
      throw new FiyuApiError({
        kind: kindForStatus(response.status, path),
        endpoint: path,
        status: response.status,
        detail,
        responseBody,
      });
    }

    try {
      return { payload: await response.json(), status: response.status };
    } catch (cause) {
      throw new FiyuApiError({
        kind: "invalid-response",
        endpoint: path,
        status: response.status,
        detail: "Response body was not valid JSON",
        cause,
      });
    }
  };

  return {
    requestRaw,
    async requestJson<TSchema extends z.ZodType>(
      path: string,
      schema: TSchema,
      options: ApiRequestOptions = {},
    ): Promise<z.infer<TSchema>> {
      const { payload, status } = await requestRaw(path, options);
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new FiyuApiError({
          kind: "invalid-response",
          endpoint: path,
          status,
          detail: describeZodIssues(parsed.error),
          cause: parsed.error,
        });
      }
      return parsed.data;
    },
  };
}
