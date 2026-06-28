import type { Config } from 'jest';

const config: Config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.(spec|test)\\.ts$',
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/reference/'],
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/reference/',
        '\\.module\\.ts$',   // dependency-injection wiring only
        '\\.entity\\.ts$',   // TypeORM data shapes, exercised through service specs
        'src/main\\.ts$',    // application bootstrap
    ],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1'
    }
};

export default config;
