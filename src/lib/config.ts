import tasks from "@config/tasks.json";
import study from "@config/study.json";

export type Task = { id: string; title: string; instructions: string[] };

export const TASKS: Task[] = tasks;
export const STUDY = study;

export function getTask(taskId: string): Task | undefined {
  return TASKS.find((t) => t.id === taskId);
}
