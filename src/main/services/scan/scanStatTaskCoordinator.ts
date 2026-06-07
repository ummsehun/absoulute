import type { ScanEventBus } from "./scanEventBus";
import type { ScanJob } from "./scanSessionTypes";

export interface ScanStatTaskCoordinatorDeps {
  emitProgressBatch: Pick<ScanEventBus, "emitProgressBatch">["emitProgressBatch"];
}

export class ScanStatTaskCoordinator {
  private readonly activeStatTasks = new WeakMap<ScanJob, Set<Promise<void>>>();

  constructor(private readonly deps: ScanStatTaskCoordinatorDeps) {}

  async schedule(job: ScanJob, task: () => Promise<void>): Promise<void> {
    const tasks = this.activeStatTasks.get(job) ?? new Set<Promise<void>>();
    this.activeStatTasks.set(job, tasks);
    job.inflightCount = tasks.size;

    while (tasks.size >= job.options.statConcurrency && !job.cancelled) {
      await Promise.race(tasks);
      await this.waitWhilePaused(job);
      job.inflightCount = tasks.size;
    }

    const running = task()
      .catch(() => undefined)
      .finally(() => {
        tasks.delete(running);
        job.inflightCount = tasks.size;
      });

    tasks.add(running);
    job.inflightCount = tasks.size;
  }

  async flush(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.allSettled(tasks);
    tasks.clear();
    job.inflightCount = 0;
  }

  hasPending(job: ScanJob): boolean {
    const tasks = this.activeStatTasks.get(job);
    return Boolean(tasks && tasks.size > 0);
  }

  async waitForNext(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.race(tasks);
  }

  async waitWhilePaused(job: ScanJob, pollMs = 80): Promise<void> {
    while (job.paused && !job.cancelled) {
      this.deps.emitProgressBatch(job, "paused", false);
      await sleep(pollMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
