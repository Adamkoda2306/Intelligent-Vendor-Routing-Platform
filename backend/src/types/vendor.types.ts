export type HealthStatus = "HEALTHY" | "WARNING" | "OFFLINE";

export interface IVendor {
  name: string;
  priority: number;
  weight: number;
  cost: number;
  avgLatencyMs: number;
  rateLimitPerMin: number;
  capabilities: string[];
  healthStatus: HealthStatus;
  enabled: boolean;
  failureRate: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateVendorDTO {
  name: string;
  priority?: number;
  weight?: number;
  cost: number;
  avgLatencyMs: number;
  rateLimitPerMin?: number;
  capabilities: string[];
  enabled?: boolean;
  failureRate?: number;
}

export type UpdateVendorDTO = Partial<CreateVendorDTO> & {
  healthStatus?: HealthStatus;
};
