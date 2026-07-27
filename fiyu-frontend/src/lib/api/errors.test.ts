import { describe, expect, it } from "vitest";

import { FiyuApiError, extractDetail, kindForStatus } from "@/lib/api/errors";
import { paths } from "@/lib/api/endpoints";

describe("kindForStatus", () => {
  it("maps the catalog status codes", () => {
    expect(kindForStatus(404, paths.restaurants)).toBe("not-found");
    expect(kindForStatus(422, paths.restaurants)).toBe("invalid-request");
  });

  it("distinguishes the two meanings of 503 by endpoint", () => {
    // api.py returns 503 for a missing database on catalog routes...
    expect(kindForStatus(503, paths.restaurant("abc"))).toBe("backend-unavailable");
    // ...and 503 for an unconfigured Google key on the photo routes.
    expect(kindForStatus(503, paths.photos("abc"))).toBe("provider-unconfigured");
  });

  it("maps the photo provider failures", () => {
    expect(kindForStatus(502, paths.photos("abc"))).toBe("provider-failed");
    expect(kindForStatus(504, paths.photos("abc"))).toBe("provider-timeout");
  });

  it("falls back to unknown for unexpected codes", () => {
    expect(kindForStatus(418, paths.restaurants)).toBe("unknown");
  });
});

describe("extractDetail", () => {
  it("reads the string form used by HTTPException", () => {
    expect(extractDetail({ detail: "Restaurant not found" })).toBe("Restaurant not found");
  });

  it("flattens the array form used by 422 validation errors", () => {
    const body = {
      detail: [
        {
          type: "less_than_equal",
          loc: ["query", "limit"],
          msg: "Input should be less than or equal to 200",
        },
      ],
    };
    expect(extractDetail(body)).toBe("query.limit: Input should be less than or equal to 200");
  });

  it("returns undefined for bodies that are not FastAPI errors", () => {
    expect(extractDetail("<html>502 Bad Gateway</html>")).toBeUndefined();
    expect(extractDetail(null)).toBeUndefined();
    expect(extractDetail({})).toBeUndefined();
    expect(extractDetail({ detail: [] })).toBeUndefined();
  });
});

describe("FiyuApiError", () => {
  it("marks transient failures as retryable", () => {
    const timeout = new FiyuApiError({ kind: "provider-timeout", endpoint: "/x" });
    expect(timeout.isRetryable).toBe(true);
  });

  it("marks permanent failures as not retryable", () => {
    // Retrying a 404 or an unconfigured Google key cannot help.
    expect(new FiyuApiError({ kind: "not-found", endpoint: "/x" }).isRetryable).toBe(false);
    expect(new FiyuApiError({ kind: "provider-unconfigured", endpoint: "/x" }).isRetryable).toBe(
      false,
    );
  });

  it("is catchable as an Error and identifiable by instanceof", () => {
    const error = new FiyuApiError({ kind: "network", endpoint: "/x" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FiyuApiError);
  });
});
