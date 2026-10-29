import { BRIEF } from "@/lib/config";
import LabeledText from "./LabeledText";

/** The Frame Marketing Brief (config/brief.json): on /brief, and in the in-page panel in focus mode. */
export default function BriefContent({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  return (
    <>
      <Title>{BRIEF.title}</Title>
      {BRIEF.pages.map((page, i) => (
        <section key={i} className={i > 0 ? "brief-page brief-page-break" : "brief-page"}>
          {page.heading && <h2 className="brief-page-heading">{page.heading}</h2>}
          {page.intro.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h3>{s.heading}</h3>
              {s.paragraphs?.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.items && (
                <ul>
                  {s.items.map((item, j) => (
                    <li key={j}>
                      <LabeledText text={item.text} label={item.label} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </section>
      ))}
    </>
  );
}
