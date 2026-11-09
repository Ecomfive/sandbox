import type { Tono } from "@/components/ui/kpi-card";

/** Error absoluto: hasta 15 % bien, hasta 30 % a vigilar, más, mal. Lo usan la página (servidor) y la tabla (cliente). */
export const tonoError = (v: number | null): Tono => (v === null ? "neutral" : v <= 0.15 ? "success" : v <= 0.3 ? "warning" : "destructive");
