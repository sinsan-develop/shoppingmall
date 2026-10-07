import assert from 'node:assert/strict';
import test from 'node:test';
import { planNotificationRetry } from '../src/notifications/retry.ts';

const failedAt = new Date('2026-10-07T00:00:00.000Z');

test('transient failures retry after one then five minutes and stop after three attempts', () => {
  assert.deepEqual(planNotificationRetry({ attemptsCompleted:1,retryable:true,failedAt }),{
    status:'retry',nextAttemptAt:new Date('2026-10-07T00:01:00.000Z'),
  });
  assert.deepEqual(planNotificationRetry({ attemptsCompleted:2,retryable:true,failedAt }),{
    status:'retry',nextAttemptAt:new Date('2026-10-07T00:05:00.000Z'),
  });
  assert.deepEqual(planNotificationRetry({ attemptsCompleted:3,retryable:true,failedAt }),{
    status:'failed',nextAttemptAt:null,
  });
  assert.equal(failedAt.toISOString(),'2026-10-07T00:00:00.000Z');
});

test('permanent failure never retries even before the attempt limit', () => {
  assert.deepEqual(planNotificationRetry({ attemptsCompleted:1,retryable:false,failedAt }),{
    status:'failed',nextAttemptAt:null,
  });
});

test('invalid attempt count or time cannot schedule a job', () => {
  assert.throws(() => planNotificationRetry({ attemptsCompleted:0,retryable:true,failedAt }),
    /Invalid notification retry/);
  assert.throws(() => planNotificationRetry({ attemptsCompleted:4,retryable:true,failedAt }),
    /Invalid notification retry/);
  assert.throws(() => planNotificationRetry({ attemptsCompleted:1,retryable:true,
    failedAt:new Date('invalid') }),/Invalid notification retry/);
});
