export default function Home() {
  const quickLinks = [
    {
      href: "https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
      label: "Explore templates",
      description: "Browse starter ideas before you shape the next round.",
    },
    {
      href: "https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
      label: "Learning center",
      description: "Keep the original guided learning path one click away.",
    },
  ];

  const actionCards = [
    {
      href: "https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
      label: "Deploy now",
      title: "Ship your first build",
      description:
        "Use the same starter deployment flow, now framed with the Niches rounded CTA treatment.",
      primary: true,
    },
    {
      href: "https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app",
      label: "Documentation",
      title: "Review the docs",
      description:
        "Jump into the official Next.js reference whenever you want to move from concept to implementation.",
      primary: false,
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-8">
        <div className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8 lg:p-10">
          <span className="inline-flex items-center rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono font-semibold text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase">
            Prompt party portal
          </span>

          <div className="mt-6 space-y-4">
            <h1 className="max-w-3xl font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Restyled with the playful Niches lobby energy.
            </h1>
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
            {quickLinks.map((link) => (
              <a
                key={link.href}
                className="group rounded-3xl border border-foreground/12 bg-background/70 p-4 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-base">{link.label}</span>
                  <span className="rounded-full border border-foreground/10 px-2 py-1 font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                    Open
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/70 group-hover:text-accent-foreground/80">
                  {link.description}
                </p>
              </a>
            ))}
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {actionCards.map((card) => (
          <article
            key={card.href}
            className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-lg shadow-primary/10 backdrop-blur-sm sm:p-8"
          >
            <span className="inline-flex items-center rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] font-semibold tracking-[0.24em] text-foreground/70 uppercase">
              {card.label}
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
              {card.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-foreground/75 sm:text-base">
              {card.description}
            </p>
            <a
              className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors sm:w-auto ${
                card.primary
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-2 border-foreground/12 bg-background/75 text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              href={card.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {card.label}
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
