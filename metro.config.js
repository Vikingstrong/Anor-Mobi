const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Apply the same memory-conscious limit to embedded release bundles and dev.
config.maxWorkers = 1;
module.exports = config;
