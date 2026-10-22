/** Shared transport bounds; importing these must not import the worker or DB. */
export const ZERO_SOURCE_DEADLINE_ERROR =
  "Source-planning deadline must be in the next 120 seconds. Omit deadline to use the server default.";

export const ZERO_JEV_LIMITS = Object.freeze({
  inputBytes: 16384,
  goalChars: 2000,
  artifactBytes: 98304,
  outstandingJobsPerScope: 4,
  deadlineMs: 120000,
  runtimeMs: 30000,
});
