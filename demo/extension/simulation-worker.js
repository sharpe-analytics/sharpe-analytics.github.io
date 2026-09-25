'use strict';
importScripts('simulation-core.js');
self.onmessage = ({ data: { jobId, input } }) => {
  try {
    const result = SimulationCore.simulate(input, progress => self.postMessage({ jobId, progress }));
    self.postMessage({ jobId, result });
  } catch (error) {
    self.postMessage({ jobId, error: error.message || 'Simulation failed.' });
  }
};
