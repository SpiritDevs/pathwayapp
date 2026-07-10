import { cronJobs, makeFunctionReference, type FunctionReference } from "convex/server";

const crons = cronJobs();

const cleanupEmailReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { deletedMessages: number }
>("email:cleanupAll") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  { deletedMessages: number }
>;
const cleanupBlobsReference = makeFunctionReference<
  "action",
  Record<string, never>,
  { deleted: number; deferred: number }
>("blobActions:cleanupDeleting") as unknown as FunctionReference<
  "action",
  "internal",
  Record<string, never>,
  { deleted: number; deferred: number }
>;

crons.daily(
  "enforce email sandbox retention",
  { hourUTC: 3, minuteUTC: 20 },
  cleanupEmailReference,
  {},
);
crons.hourly(
  "delete private blobs marked for removal",
  { minuteUTC: 35 },
  cleanupBlobsReference,
  {},
);

export default crons;
