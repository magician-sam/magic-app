'use strict';

// Original application implementation. This is a runtime hint, not a security check.
exports.isNodeProcess = function isNodeProcess() {
  const runtime = globalThis.process;
  return runtime !== null && typeof runtime === 'object'
    && runtime.release?.name === 'node'
    && typeof runtime.versions?.node === 'string'
    && runtime.versions.node.length > 0;
};
