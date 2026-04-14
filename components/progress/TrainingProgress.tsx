type ProgressStat = {
  label: string;
  value: string | number;
};

type TrainingProgressProps = {
  title: string;
  current: number;
  goal: number;
  stats?: ProgressStat[];
};

function clampProgress(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export default function TrainingProgress({
  title,
  current,
  goal,
  stats = [],
}: TrainingProgressProps) {
  const percent = goal > 0 ? clampProgress((current / goal) * 100) : 0;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-muted text-xs">
          {current}/{goal}
        </p>
      </div>

      <div className="progress-track h-2 w-full rounded-full">
        <div
          className="progress-fill h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      {stats.length > 0 && (
        <div
          className={
            stats.length === 4
              ? "mt-3 grid grid-cols-2 gap-2"
              : "mt-3 grid grid-cols-3 gap-2"
          }
        >
          {stats.map((stat) => (
            <div key={stat.label} className="surface-card rounded-lg p-2 text-center">
              <p className="text-xs font-semibold">{stat.value}</p>
              <p className="text-muted text-[11px]">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
