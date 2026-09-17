"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoFinanzas } from "@/lib/dashboard/queries";

export function FinanzasChart({ datos }: { datos: PuntoFinanzas[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datos} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => Number(value).toFixed(2)}
        />
        <Bar dataKey="diferencia" name="Diferencia banco vs. plataforma" radius={[3, 3, 3, 3]}>
          {datos.map((d, i) => (
            <Cell key={i} fill={Math.abs(d.diferencia) > 0.01 ? "var(--destructive)" : "var(--success)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
