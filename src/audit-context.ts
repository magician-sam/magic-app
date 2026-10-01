import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";
import type { Role } from "./models.js";

export interface AuditContext {
  userId: string;
  role: Role;
  requestId: string;
  method: string;
  path: string;
  deviceId?: string;
  deviceName?: string;
  userAgent: string;
  deviceSource: "browser-reported" | "unidentified";
}
// Request-scoped storage prevents concurrent staff actions sharing identities.
export const auditContext = new AsyncLocalStorage<AuditContext>();
export function deviceContext(req: Request) {
  const deviceId = req.get("X-Magic-Device-Id");
  const name = req.get("X-Magic-Device-Name")?.trim();
  return {
    ...(deviceId && /^[a-zA-Z0-9-]{16,80}$/.test(deviceId) ? { deviceId } : {}),
    ...(name && name.length <= 80 && !Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? { deviceName: name } : {}),
    userAgent: (req.get("User-Agent") ?? "").slice(0, 300),
    deviceSource: deviceId && /^[a-zA-Z0-9-]{16,80}$/.test(deviceId)
      ? "browser-reported" as const : "unidentified" as const,
  };
}

