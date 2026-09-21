import { TRAIL } from "../../lib/journeyTrail";

// The five-step journey as a trail: icon nodes joined by a dashed path, each a
// link to its step further down the page. Replaces a numbered list.

const JourneyTrail = () => (
  <ol className="flex items-start w-full max-w-3xl" aria-label="The five steps">
    {TRAIL.map(({ id, label, Icon }, i) => (
      <li key={id} className="flex items-start flex-1 min-w-0 last:flex-none">
        <a href={`#step-${id}`} className="group flex flex-col items-center gap-2 shrink-0">
          <span className="w-12 h-12 rounded-full bg-canvas border border-stroke text-accent inline-flex items-center justify-center text-xl transition group-hover:bg-accent group-hover:text-accent-fg group-hover:border-accent group-hover:-translate-y-0.5">
            <Icon aria-hidden />
          </span>
          <span className="text-sm font-medium text-paper">{label}</span>
        </a>
        {i < TRAIL.length - 1 && (
          <span className="flex-1 mt-6 mx-2 sm:mx-3 h-px border-t-2 border-dashed border-accent/40" aria-hidden />
        )}
      </li>
    ))}
  </ol>
);

export default JourneyTrail;
