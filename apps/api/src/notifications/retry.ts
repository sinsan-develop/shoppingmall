export type NotificationRetryInput = {
  attemptsCompleted: number;
  retryable: boolean;
  failedAt: Date;
};

export type NotificationRetryPlan =
  | { status: 'retry'; nextAttemptAt: Date }
  | { status: 'failed'; nextAttemptAt: null };

const retryDelayMs = [60_000,300_000] as const;

/** One initial attempt and at most two retries; provider outcomes remain separately auditable. */
export function planNotificationRetry(candidate: unknown): NotificationRetryPlan {
  const input = candidate as Partial<NotificationRetryInput> | null;
  const attemptsCompleted = input?.attemptsCompleted;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof attemptsCompleted !== 'number' || !Number.isInteger(attemptsCompleted) ||
      attemptsCompleted < 1 || attemptsCompleted > 3 || typeof input.retryable !== 'boolean' ||
      !(input.failedAt instanceof Date) || !Number.isFinite(input.failedAt.getTime()))
    throw new Error('Invalid notification retry');
  if (!input.retryable || attemptsCompleted === 3)
    return { status:'failed',nextAttemptAt:null };
  return { status:'retry',
    nextAttemptAt:new Date(input.failedAt.getTime()+retryDelayMs[attemptsCompleted-1]) };
}
