export type ServiceName = "api" | "web";

export interface HealthPayload {
  service: ServiceName;
  status: "ok";
  timestamp: string;
}

export function createHealthPayload(service: ServiceName): HealthPayload {
  return {
    service,
    status: "ok",
    timestamp: new Date().toISOString()
  };
}
