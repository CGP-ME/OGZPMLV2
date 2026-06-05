'use strict';

function createMockMaxProfitManager(jestObject, ActualMaxProfitManager) {
  const MockMaxProfitManager = jestObject.fn().mockImplementation(() => ({
    start: jestObject.fn(),
  }));

  for (const key of Reflect.ownKeys(ActualMaxProfitManager)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    const descriptor = Object.getOwnPropertyDescriptor(ActualMaxProfitManager, key);
    if (descriptor) {
      Object.defineProperty(MockMaxProfitManager, key, descriptor);
    }
  }

  return MockMaxProfitManager;
}

module.exports = {
  createMockMaxProfitManager,
};
