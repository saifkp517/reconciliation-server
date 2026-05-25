export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration\\.spec\\.ts$',  // separate from unit tests
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};
