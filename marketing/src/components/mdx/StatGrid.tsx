export interface StatItem {
  value: string;
  caption: string;
  source?: string;
}

interface StatGridProps {
  stats: StatItem[];
}

export function StatGrid({ stats }: StatGridProps) {
  return (
    <div className="not-prose grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
      {stats.map((stat) => (
        <div
          key={stat.value}
          data-stat-card
          className="bg-card border rounded-lg p-5 text-center"
        >
          <p className="text-2xl sm:text-3xl font-bold text-primary mb-1">
            {stat.value}
          </p>
          <p className="text-sm text-muted-foreground">{stat.caption}</p>
          {stat.source && (
            <p className="text-xs text-muted-foreground mt-2">
              {stat.source}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
