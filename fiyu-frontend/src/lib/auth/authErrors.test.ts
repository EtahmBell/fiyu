import { describe, expect, it } from "vitest";

import { AuthRequestError, authCodeForResponse, classifyAuthFailure } from "@/lib/auth/authErrors";

describe("auth error taxonomy", () => {
  it("classifies stable HTTP statuses before user-facing rendering", () => {
    expect(authCodeForResponse(401, {}, "signin")).toBe("invalid_credentials");
    expect(authCodeForResponse(403, { detail: "Please verify your email" }, "signin")).toBe("email_not_confirmed");
    expect(authCodeForResponse(409, { detail: "An account already exists" }, "signup")).toBe("user_already_exists");
    expect(authCodeForResponse(429, {}, "signup")).toBe("rate_limited");
    expect(authCodeForResponse(504, {}, "signin")).toBe("request_timeout");
    expect(authCodeForResponse(503, {}, "signin")).toBe("service_unavailable");
  });

  it("distinguishes partial account setup from a failed account creation", () => {
    expect(authCodeForResponse(503, { detail: "Account was created but profile setup is incomplete" }, "signup")).toBe("account_setup_incomplete");
  });

  it("uses browser offline state as a hint for thrown network errors", () => {
    const error = classifyAuthFailure(new TypeError("fetch failed"));
    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error.code).toBe("network_unreachable");
    expect(error.message).not.toContain("fetch failed");
  });
});
