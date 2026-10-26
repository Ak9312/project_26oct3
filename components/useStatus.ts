"use client";
import { useEffect, useState } from "react";
import { api, type Status } from "@/lib/client";

export function useStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch(() => setStatus(null));
  }, []);
  return status;
}
