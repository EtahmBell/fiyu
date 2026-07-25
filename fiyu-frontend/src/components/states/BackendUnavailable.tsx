import { StatusMessage } from "@/components/ui/StatusMessage";
import type { FiyuApiError } from "@/lib/api/errors";
import { getApiBaseUrl } from "@/lib/config/env";

export interface BackendUnavailableProps {
  error: FiyuApiError;
}

interface Copy {
  title: string;
  body: string;
  showRestartCommand: boolean;
}

/**
 * Copy is chosen from the classified error kind rather than the status code, so
 * each cause gets an accurate explanation. In particular a 503 on the catalog
 * means the backend's SQLite file is missing -- a different fix from the
 * backend simply not running.
 */
function copyFor(error: FiyuApiError): Copy {
  switch (error.kind) {
    case "offline":
      return {
        title: "You're offline",
        body: "Reconnect to load the restaurant catalog.",
        showRestartCommand: false,
      };
    case "backend-unavailable":
      return {
        title: "The backend database is missing",
        body: "The API is running but cannot find its SQLite database, so no restaurants can be served.",
        showRestartCommand: false,
      };
    case "invalid-response":
      return {
        title: "The catalog response wasn't readable",
        body: "The backend replied, but not with the restaurant data this app expects.",
        showRestartCommand: false,
      };
    default:
      return {
        title: "Can't reach the Fiyu backend",
        body: "No response from the API.",
        showRestartCommand: true,
      };
  }
}

export function BackendUnavailable({ error }: BackendUnavailableProps) {
  const { title, body, showRestartCommand } = copyFor(error);

  return (
    <StatusMessage
      tone="error"
      title={title}
      description={
        <div className="space-y-2">
          <p>{body}</p>
          <p className="text-xs text-ink-faint">
            Endpoint: <code className="font-mono">{getApiBaseUrl()}/public/restaurants</code>
          </p>
          {showRestartCommand && (
            <>
              <p>Start it from the repository root:</p>
              <pre className="overflow-x-auto rounded bg-surface p-3 font-mono text-xs text-ink-muted">
                cd fiyu-backend{"\n"}
                .venv\Scripts\Activate.ps1{"\n"}
                uvicorn fiyu.api:app --reload --port 8000
              </pre>
            </>
          )}
          {error.detail && <p className="text-xs text-ink-faint">Detail: {error.detail}</p>}
        </div>
      }
    />
  );
}
