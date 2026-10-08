import tasks from "@config/tasks.json";
import study from "@config/study.json";

/** A task from config/tasks.json. Optional tasks don't trigger the End work warning. */
export type Task = { id: string; title: string; required: boolean; instructions: string[] };

export const TASKS: Task[] = tasks;
export const STUDY = study;

export function getTask(taskId: string): Task | undefined {
  return TASKS.find((t) => t.id === taskId);
}

export const REQUIRED_TASK_IDS = TASKS.filter((t) => t.required).map((t) => t.id);
