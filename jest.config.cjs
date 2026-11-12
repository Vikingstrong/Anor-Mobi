module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.cjs'],
  transform: {
    '^.+\\.ts$': ['babel-jest', {
      babelrc: false, configFile: false,
      presets: ['@babel/preset-typescript'],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }],
  },
};
