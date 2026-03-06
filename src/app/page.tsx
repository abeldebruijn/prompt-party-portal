export default function Home() {

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-8">
        <div className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8 lg:p-10">
          <span className="inline-flex items-center rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono font-semibold text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase">
            Prompt party portal
          </span>

          <div className="mt-6 space-y-4">
            <p className="max-w-2xl text-base leading-7 text-foreground/90 sm:text-lg sm:leading-8">
              The homepage keeps the same starter flow, but now uses the Niches
              visual language: rounded surfaces, mono-forward hierarchy, soft
              glassy cards, and bright CTA contrast against the shared theme.
            </p>
            <p className="text-sm leading-6 text-foreground/70 sm:text-base">
              Start by editing{" "}
              <span className="font-mono">src/app/page.tsx</span>, then use the
              quick links below to keep moving.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
          </div>
        </div>

        <aside className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-lg shadow-primary/10 backdrop-blur-sm sm:p-8">
          <span className="inline-flex items-center rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] font-semibold tracking-[0.24em] text-foreground/70 uppercase">
            Starter workflow
          </span>
          <h2 className="mt-5 font-display text-4xl leading-none text-foreground">
            Build, learn, and launch from one polished landing page.
          </h2>
          <p className="mt-4 text-sm leading-6 text-foreground/75 sm:text-base">
            This mirrors the Niches homepage structure without importing any of
            its app logic: a welcoming hero, a compact guidance panel, and two
            clear action cards.
          </p>

          <div className="mt-6 space-y-3">
            {[
              "Mono-led heading and compact helper copy for fast scanning.",
              "Rounded card surfaces with subtle borders and translucent fills.",
              "Full-width CTA treatment that keeps the original starter links intact.",
            ].map((item, index) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-3xl border border-foreground/10 bg-background/70 p-4"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-6 text-foreground/80">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

    </main>
  );
}
