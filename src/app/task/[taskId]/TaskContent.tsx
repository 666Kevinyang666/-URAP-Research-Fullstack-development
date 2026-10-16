import type { Task } from "@/lib/config";
import LabeledText from "@/components/LabeledText";

/** Task text from config/tasks.json: intro, optional quote, Submit list, Materials, closing line. */
export default function TaskContent({ task }: { task: Task }) {
  const [first, ...rest] = task.intro;
  return (
    <div className="task-content">
      {first && <p>{first}</p>}
      {task.quote && <blockquote className="task-quote">“{task.quote}”</blockquote>}
      {rest.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="task-submit-heading">
        <strong>Submit</strong>
      </p>
      <ul>
        {task.submit.map((s, i) => (
          <li key={i}>
            <LabeledText text={s} />
          </li>
        ))}
      </ul>
      {task.closing && <p>{task.closing}</p>}
      {task.materials && (
        <p className="task-materials">
          <strong>Materials:</strong> {task.materials}
        </p>
      )}
    </div>
  );
}
