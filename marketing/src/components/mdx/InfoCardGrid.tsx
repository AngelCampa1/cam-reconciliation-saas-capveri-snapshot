import { AlertTriangle, Calculator, FileText, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  AlertTriangle,
  Calculator,
  FileText,
  TrendingUp,
};

export interface InfoCardItem {
  icon: string;
  title: string;
  desc: string;
}

interface InfoCardGridProps {
  items: InfoCardItem[];
}

export function InfoCardGrid({ items }: InfoCardGridProps) {
  return (
    <div className="not-prose grid grid-cols-1 gap-4 mb-6 md:grid-cols-2">
      {items.map((item) => {
        const Icon = ICON_MAP[item.icon];
        return (
          <div
            key={item.title}
            className="flex gap-4 p-4 border rounded-lg bg-card"
          >
            {Icon && (
              <Icon
                className="w-6 h-6 text-primary flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
            )}
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-base text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
