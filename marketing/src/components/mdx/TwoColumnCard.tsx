import { AlertTriangle, FileText } from "lucide-react";

interface ColumnData {
  title: string;
  items: string[];
  variant?: "default" | "warning";
}

interface TwoColumnCardProps {
  left: ColumnData;
  right: ColumnData;
}

function renderColumn(col: ColumnData) {
  const Icon = col.variant === "warning" ? AlertTriangle : FileText;
  const iconClass = col.variant === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="bg-card border rounded-lg p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconClass}`} aria-hidden="true" />
        {col.title}
      </h3>
      <ul className="space-y-2 text-base text-muted-foreground">
        {col.items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

export function TwoColumnCard({ left, right }: TwoColumnCardProps) {
  return (
    <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {renderColumn(left)}
      {renderColumn(right)}
    </div>
  );
}
