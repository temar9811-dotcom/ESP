// FILE: main/assets-diag.js
// VERSION: 1.1.16-beta
'use strict';

let diag = {
  stationHits: 0,
  structureHits: 0,
  namesHits: 0,
  containerHits: 0,
  fallbackCount: 0,
  failedStructures: []
};

function diagReset() {
  diag = {
    stationHits: 0,
    structureHits: 0,
    namesHits: 0,
    containerHits: 0,
    fallbackCount: 0,
    failedStructures: []
  };
}

function diagRecord(kind, id = null) {
  if (kind === 'station') diag.stationHits += 1;
  else if (kind === 'structure') diag.structureHits += 1;
  else if (kind === 'names') diag.namesHits += 1;
  else if (kind === 'container') diag.containerHits += 1;
  else diag.fallbackCount += 1;

  if (kind === 'fallback' && id != null) diag.failedStructures.push(Number(id));
}

function getDiag() {
  return { ...diag, failedStructures: diag.failedStructures.slice() };
}

module.exports = {
  diagReset,
  diagRecord,
  getDiag
};