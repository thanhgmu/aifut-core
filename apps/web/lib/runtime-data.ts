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
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
    });

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
