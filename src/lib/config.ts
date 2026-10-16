import tasks from "@config/tasks.json";
import study from "@config/study.json";
import brief from "@config/brief.json";
import welcome from "@config/welcome.json";

/** A task as written in config/tasks.json. Optional tasks don't trigger the End work warning. */
type TaskContent = {
  id: string;
  title: string;
  required: boolean;
  /** Paragraphs before the Submit list. */
  intro: string[];
  /** Quoted line (e.g. the marketing director's quote), shown after the first intro paragraph. */
  quote?: string;
  /** "Submit" bullets. A leading "Label:" is shown in bold. */
  submit: string[];
  /** "Materials" line. */
  materials?: string;
  /** Paragraph after the Submit list. */
  closing?: string;
};

/**
 * A task plus `instructions`: the full task text as plain lines, derived from the
 * fields above. The AI system prompt (buildSystemPrompt in @/lib/ai) reads this, so the
 * assistant sees the same task text the participant does.
 */
export type Task = TaskContent & { instructions: string[] };

function toTask(t: TaskContent): Task {
  const [first, ...rest] = t.intro;
  const instructions = [
    ...(first ? [first] : []),
    ...(t.quote ? [`“${t.quote}”`] : []),
    ...rest,
    "Submit:",
    ...t.submit.map((s) => `- ${s}`),
    ...(t.materials ? [`Materials: ${t.materials}`] : []),
    ...(t.closing ? [t.closing] : []),
  ];
  return { ...t, instructions };
}

export const TASKS: Task[] = (tasks as TaskContent[]).map(toTask);
export const STUDY = study;

/** Frame Marketing Brief (config/brief.json), rendered at /brief. */
export type BriefItem = { label?: string; text: string };
export type BriefSection = { heading: string; paragraphs?: string[]; items?: BriefItem[] };
export type BriefPage = { heading?: string; intro: string[]; sections: BriefSection[] };
export const BRIEF: { title: string; pages: BriefPage[] } = brief;

/** "Welcome to Frame" intro (config/welcome.json), shown before Start work. */
export const WELCOME: { title: string; paragraphs: string[] } = welcome;

export function getTask(taskId: string): Task | undefined {
  return TASKS.find((t) => t.id === taskId);
}

export const REQUIRED_TASK_IDS = TASKS.filter((t) => t.required).map((t) => t.id);
