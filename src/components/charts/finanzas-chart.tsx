"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoFinanzas } from "@/lib/dashboard/queries";

function PuntoColoreado(props: { cx?: number; cy?: number; payload?: PuntoFinanzas }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const ok = Math.abs(payload.diferencia) <= 0.01;
  return <circle cx={cx} cy={cy} r={4} fill={ok ? "var(--success)" : "var(--destructive)"} />;
}

export function FinanzasChart({ datos }: { datos: PuntoFinanzas[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={datos} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="periodo"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => Number(value).toFixed(2)}
        />
        <Line
          type="monotone"
          dataKey="diferencia"
          name="Diferencia banco vs. plataforma"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          dot={<PuntoColoreado />}
          activeDot={<PuntoColoreado />}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
