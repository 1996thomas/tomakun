import Link from "next/link";
import DailyRoutineCard from "@/components/routine/DailyRoutineCard";

const SERIES = ["short", "medium", "long"] as const;

function seriesLabel(s: (typeof SERIES)[number]): string {
  if (s === "short") return "10";
  if (s === "medium") return "30";
  return "Full";
}

export default function Home() {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <p className="text-muted mb-2 text-center text-xs">
        Accueil — ta routine enregistree (navigateur) apparait ci-dessous des qu&apos;elle existe.
      </p>
      <DailyRoutineCard />

      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold">Entrainement libre</p>
        <p className="text-muted mt-1 text-xs">
          Sans lien avec ta routine. Choisis katakana ou hiragana, puis la taille de la serie.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-muted mb-2 text-xs font-medium">Katakana</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((s) => (
                <Link
                  key={s}
                  href={`/kana?mode=free&series=${s}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(s)}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted mb-2 text-xs font-medium">Hiragana</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((s) => (
                <Link
                  key={s}
                  href={`/hiragana?mode=free&series=${s}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(s)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card rounded-xl p-5 shadow-sm">
        <p className="text-muted text-sm font-medium">TOMAKUN</p>
        <h1 className="mt-1 text-2xl font-bold">Training Hub</h1>
        <p className="text-muted mt-2 text-sm">
          Routine enregistree puis lancee quand tu veux, ou session libre ci-dessus.
        </p>
        <p className="text-muted mt-4 text-center text-xs">
          Les autres modules arriveront plus tard.
        </p>
      </div>
    </section>
  );
}
