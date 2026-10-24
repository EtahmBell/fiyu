import { createFetchTransport, FiyuApiError } from "@fiyu/contracts";
import { z } from "zod";

const responseSchema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("native API transport", () => {
  it("sends the requested method/path and attaches an available token", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ ok: true }));
    const transport = createFetchTransport({
      baseUrl: "https://api.fiyuapp.com",
      tokenProvider: { getAccessToken: async () => "secret-test-token" },
      fetchImplementation: fetchMock as typeof fetch,
    });
    await transport.requestJson("/proof", responseSchema, { method: "POST", body: { test: true } });
    expect(fetchMock).toHaveBeenCalledWith("https://api.fiyuapp.com/proof", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secret-test-token" }) }));
  });

  it("omits authorization when no token exists", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ ok: true }));
    const transport = createFetchTransport({
      baseUrl: "https://api.fiyuapp.com",
      tokenProvider: { getAccessToken: async () => null },
      fetchImplementation: fetchMock as typeof fetch,
    });
    await transport.requestJson("/proof", responseSchema);
    const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("normalizes backend and network failures", async () => {
    const backend = createFetchTransport({ baseUrl: "https://api.fiyuapp.com", fetchImplementation: jest.fn(async () => jsonResponse({ detail: "No session" }, 401)) as typeof fetch });
    await expect(backend.requestJson("/private", responseSchema)).rejects.toMatchObject({ kind: "unauthorized", detail: "No session" });
    const network = createFetchTransport({ baseUrl: "https://api.fiyuapp.com", fetchImplementation: jest.fn(async () => { throw new Error("offline"); }) as typeof fetch });
    await expect(network.requestJson("/proof", responseSchema)).rejects.toBeInstanceOf(FiyuApiError);
    await expect(network.requestJson("/proof", responseSchema)).rejects.toMatchObject({ kind: "network" });
  });

  it("rejects malformed successful responses", async () => {
    const transport = createFetchTransport({ baseUrl: "https://api.fiyuapp.com", fetchImplementation: jest.fn(async () => jsonResponse({ ok: "yes" })) as typeof fetch });
    await expect(transport.requestJson("/proof", responseSchema)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
