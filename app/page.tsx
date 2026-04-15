import Link from "next/link";

const SERIES = ["short", "medium", "long"] as const;
type SeriesKey = (typeof SERIES)[number];

function seriesLabel(series: SeriesKey): string {
  if (series === "short") return "10";
  if (series === "medium") return "30";
  return "Full";
}

export default function Home() {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold">Entrainement</p>
        <p className="text-muted mt-1 text-xs">
          Choisis katakana ou hiragana, puis la taille de la serie.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-muted mb-2 text-xs font-medium">Katakana</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((series) => (
                <Link
                  key={series}
                  href={`/kana?series=${series}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(series)}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted mb-2 text-xs font-medium">Hiragana</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((series) => (
                <Link
                  key={series}
                  href={`/hiragana?series=${series}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(series)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold">Vocabulaire JLPT</p>
        <p className="text-muted mt-1 text-xs">
          Pipeline de donnees local : import brut {"->"} normalisation {"->"} JSON exploitable.
        </p>
        <Link
          href="/vocab"
          className="btn-primary mt-3 flex h-10 items-center justify-center rounded-lg text-sm font-medium"
        >
          Ouvrir les flashcards N5 a N1
        </Link>
      </div>

      <div className="surface-card rounded-xl p-5 shadow-sm">
        <p className="text-muted text-sm font-medium">TOMAKUN</p>
        <h1 className="mt-1 text-2xl font-bold">Training Hub</h1>
        <p className="text-muted mt-2 text-sm">
          Plateforme JLPT data-driven (kana + vocab pour commencer).
        </p>
      </div>
    </section>
  );
}
