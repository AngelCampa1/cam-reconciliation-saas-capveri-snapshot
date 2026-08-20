import { AlertTriangle, Info, Lightbulb } from "lucide-react";

interface AlertProps {
  type?: "info" | "warning" | "tip";
  title?: string;
  children: React.ReactNode;
}

const configs = {
  info: {
    wrapper: "bg-primary/10 border-primary/20",
    icon: Info,
    iconClass: "text-primary",
    titleClass: "text-primary",
  },
  warning: {
    wrapper: "bg-warning/10 border-warning/30",
    icon: AlertTriangle,
    iconClass: "text-warning",
    titleClass: "text-warning-foreground",
  },
  tip: {
    wrapper: "bg-success/10 border-success/30",
    icon: Lightbulb,
    iconClass: "text-success",
    titleClass: "text-success-strong",
  },
};

export function Alert({ type = "info", title, children }: AlertProps) {
  const cfg = configs[type];
  const Icon = cfg.icon;
  return (
    <div
      className={`not-prose border rounded-lg p-4 sm:p-6 mb-8 ${cfg.wrapper}`}
      role="note"
    >
      {title && (
        <h2
          className={`text-lg font-semibold mb-2 flex items-center gap-2 ${cfg.titleClass}`}
        >
          <Icon className={`w-5 h-5 ${cfg.iconClass}`} aria-hidden="true" />
          {title}
        </h2>
      )}
      <div className="text-foreground [&>p]:mb-0">{children}</div>
    </div>
  );
}
