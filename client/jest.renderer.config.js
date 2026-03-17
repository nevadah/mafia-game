/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  roots: ['<rootDir>/renderer/tests'],
  testMatch: ['**/*.test.jsx', '**/*.test.tsx'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }]
      ]
    }]
  },
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/renderer/tests/__mocks__/styleMock.js'
  },
  testTimeout: 10000
};
