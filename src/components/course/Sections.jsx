import { FiCheck } from "react-icons/fi";

// Shared renderer for course content sections (chapters + course intro).
// Section kinds:
//   { h, p }      heading + paragraph
//   { p }         paragraph
//   { h, list }   heading + bullets
//   { remember }  the "Remember" callout
const Sections = ({ sections }) => (
  <article className="space-y-8 mb-14">
    {sections.map((s, i) => {
      if (s.remember) {
        return (
          <aside
            key={i}
            className="bg-accent/5 border-l-2 border-accent rounded-r-xl px-5 py-4"
          >
            <p className="text-accent text-xs font-semibold tracking-[0.16em] uppercase mb-1.5">
              Remember
            </p>
            <p className="text-paper text-base leading-relaxed">{s.remember}</p>
          </aside>
        );
      }
      return (
        <section key={i}>
          {s.h && (
            <h2 className="font-display text-paper text-2xl sm:text-3xl mb-3">{s.h}</h2>
          )}
          {s.p && <p className="text-paper-dim text-base leading-relaxed">{s.p}</p>}
          {s.list && (
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {s.list.map((li, j) => (
                <li key={j} className="flex items-start gap-2 text-paper-dim text-base leading-relaxed">
                  <FiCheck className="shrink-0 mt-1 text-accent" />
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    })}
  </article>
);

export default Sections;
