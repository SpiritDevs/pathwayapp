import * as os from "node:os";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface SystemHeadroomSample {
  readonly cpuPercent: number | null;
  readonly freeMemoryMb: number | null;
}

interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

const readCpuTimes = (): CpuTimes => {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
};

const readCpuTimesSafely = Effect.try({
  try: readCpuTimes,
  catch: () => null,
}).pipe(Effect.orElseSucceed(() => null));

const readFreeMemorySafely = Effect.try({
  try: () => os.freemem() / (1024 * 1024),
  catch: () => null,
}).pipe(Effect.orElseSucceed(() => null));

export class SystemHeadroom extends Context.Service<
  SystemHeadroom,
  {
    readonly sample: Effect.Effect<SystemHeadroomSample>;
  }
>()("pathwayos/issues/delegation/SystemHeadroom") {}

export const SystemHeadroomLive = Layer.succeed(
  SystemHeadroom,
  SystemHeadroom.of({
    sample: Effect.gen(function* () {
      const first = yield* readCpuTimesSafely;
      yield* Effect.sleep("500 millis");
      const [second, freeMemoryMb] = yield* Effect.all([readCpuTimesSafely, readFreeMemorySafely]);

      if (first === null || second === null) {
        return { cpuPercent: null, freeMemoryMb };
      }

      const totalDelta = second.total - first.total;
      const idleDelta = second.idle - first.idle;
      const cpuPercent =
        totalDelta > 0
          ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
          : null;
      return { cpuPercent, freeMemoryMb };
    }).pipe(
      Effect.catchCause(() =>
        Effect.succeed({ cpuPercent: null, freeMemoryMb: null } satisfies SystemHeadroomSample),
      ),
    ),
  }),
);
