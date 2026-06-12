export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3002";

export type HealthResponse = {
  status?: string;
  service?: string;
  database?: string;
  timestamp?: string;
  platform?: {
    model?: string;
    foundations?: string[];
    next?: string[];
    implementationNext?: string[];
  };
};

export type AdapterInterfaceRegistryResponse = {
  capability?: string;
  status?: string;
  adapterInterfaces?: Array<{
    key: string;
    appDefinitionKey: string;
    adapterContractKey: string;
    connectorKey: string;
    status: string;
    requestShape: string;
    responseShape: string;
    normalizedInputs: string[];
    normalizedOutputs: string[];
    activationPolicy: string;
    runtimeBinding: string;
  }>;
  next?: string[];
};

export async function getJson<T>(path: string): Promise<T | null> {
  const result = await getJsonResult<T>(path);
  return result.data;
}

export type JsonResult<T> = {
  data: T | null;
  status: number | null;
  error: string | null;
};

async function getResponseError(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}`;

  try {
    const payload = (await res.json()) as { message?: unknown };
    const messages = Array.isArray(payload.message)
      ? payload.message.filter(
          (message): message is string =>
            typeof message === "string" && message.trim().length > 0,
        )
      : [];
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : messages.join("; ");

    return message ? `${fallback}: ${message}` : fallback;
  } catch {
    return fallback;
  }
}

export async function getJsonResult<T>(path: string): Promise<JsonResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        data: null,
        status: res.status,
        error: await getResponseError(res),
      };
    }

    return {
      data: (await res.json()) as T,
      status: res.status,
      error: null,
    };
  } catch {
    return {
      data: null,
      status: null,
      error: "API unreachable",
    };
  }
}

export async function postJsonResult<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<JsonResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        data: null,
        status: res.status,
        error: await getResponseError(res),
      };
    }

    return {
      data: (await res.json()) as T,
      status: res.status,
      error: null,
    };
  } catch {
    return {
      data: null,
      status: null,
      error: "API unreachable",
    };
  }
}
