import { createHealthPayload } from "@cuslabel/shared";

const checks = [
  "React client",
  "Tailwind styles",
  "Express API route",
  "Shared package import"
];

export function App() {
  const sharedCheck = createHealthPayload("web");

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
            Annotation platform scaffold
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            Frontend and backend workspace initialized.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300">
            The repository is ready for the project, image, class, annotation,
            and export flows described in the implementation issues.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {checks.map((check) => (
            <div
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              key={check}
            >
              <span className="text-sm font-medium text-neutral-100">
                {check}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-cyan-900 bg-cyan-950/40 px-4 py-3 text-sm text-cyan-100">
          Shared DTO check: {sharedCheck.status}:{sharedCheck.service}
        </div>
      </section>
    </main>
  );
}
