const { withGradleProperties } = require('expo/config-plugins');

// Keep these settings reproducible when Expo regenerates android/.
module.exports = function withLimitedBuildResources(config) {
  return withGradleProperties(config, (mod) => {
    const properties = {
      'org.gradle.jvmargs': '-Xmx1536m -XX:MaxMetaspaceSize=512m -XX:ReservedCodeCacheSize=256m -XX:ActiveProcessorCount=2',
      'org.gradle.parallel': 'false',
      'org.gradle.workers.max': '1',
      'org.gradle.daemon': 'false',
      'kotlin.compiler.execution.strategy': 'in-process',
      'reactNativeArchitectures': 'armeabi-v7a,arm64-v8a',
    };
    mod.modResults = mod.modResults.filter(
      (entry) => entry.type !== 'property' || !(entry.key in properties),
    );
    for (const [key, value] of Object.entries(properties)) {
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
};
