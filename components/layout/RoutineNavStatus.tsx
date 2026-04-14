"use client";

import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { useRoutineBundle } from "@/hooks/use-routine-bundle";
import { cn } from "@/lib/utils";

export default function RoutineNavStatus() {
  const [bundle] = useRoutineBundle();
  const plan = bundle.plan;
  const run = bundle.run;

  if (!plan) {
    return (
      <Link
        href="/#ma-routine"
        className={cn(
          badgeVariants({ variant: "outline" }),
          "max-w-[5.5rem] shrink-0 truncate sm:max-w-none",
        )}
        title="Configurer ma routine"
      >
        Routine
      </Link>
    );
  }

  if (!run) {
    return (
      <Link
        href="/routine"
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "max-w-[5.5rem] shrink-0 truncate sm:max-w-none",
        )}
        title="Routine du jour — a commencer"
      >
        A faire
      </Link>
    );
  }

  if (run.status === "completed") {
    return (
      <Link
        href="/routine"
        className={cn(
          badgeVariants({ variant: "success" }),
          "max-w-[5.5rem] shrink-0 truncate sm:max-w-none",
        )}
        title="Routine du jour terminee"
      >
        Faite
      </Link>
    );
  }

  return (
    <Link
      href="/routine"
      className={cn(
        badgeVariants({ variant: "default" }),
        "max-w-[5.5rem] shrink-0 truncate sm:max-w-none",
      )}
      title={`Routine en cours — ${run.doneCount}/${run.targetCount}`}
    >
      En cours
    </Link>
  );
}
