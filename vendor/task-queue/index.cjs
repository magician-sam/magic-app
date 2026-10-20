'use strict';

// Original implementation of the callable limiter needed by @libsql/client 0.18.0.
// Zero/omitted limits mean unlimited work. Jobs start FIFO; each owns its result.
module.exports = function createTaskQueue(concurrency = 0) {
  if (typeof concurrency !== 'number' || Number.isNaN(concurrency) || concurrency < 0) {
    throw new RangeError('Concurrency must be a non-negative number');
  }
  const capacity = concurrency === 0 ? Infinity : Math.ceil(concurrency);
  const waiting = [];
  let running = 0;

  function drain() {
    while (waiting.length > 0 && running < capacity) {
      const job = waiting.shift();
      running += 1;
      // Adopt returned promises/thenables and synchronous errors through one path.
      Promise.resolve().then(job.task).then(
        value => finish(job, true, value),
        error => finish(job, false, error),
      );
    }
  }

  function finish(job, succeeded, result) {
    running -= 1;
    if (succeeded) job.resolve(result);
    else job.reject(result);
    drain();
  }

  function schedule(task) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('A task function is required'));
    return new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      drain();
    });
  }
  Object.defineProperty(schedule, 'queue', { get: () => waiting.length });
  return schedule;
};
