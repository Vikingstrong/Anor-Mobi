#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Fedora/systemd: bound the whole process tree, not just the Java heap.
if [[ "${1:-}" != "--inside-scope" ]]; then
  mode="${1:-debug}"
  if [[ "$mode" != "debug" && "$mode" != "--standalone" ]]; then
    echo "Use npm run build:android [-- --standalone]" >&2
    exit 2
  fi
  if systemctl --user is-active --quiet anor-balance-metro.scope; then
    systemctl --user stop anor-balance-metro.scope
  fi
  exec systemd-run --user --scope --collect --expand-environment=no --unit=anor-balance-build \
    -p MemoryHigh=3G -p MemoryMax=4G -p CPUQuota=800% \
    nice -n 10 bash scripts/build-android.sh --inside-scope "$mode"
fi

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=1024"
export CMAKE_BUILD_PARALLEL_LEVEL=1

if [[ -z "${JAVA_HOME:-}" && -x "$HOME/.local/share/anor-tools/jdk-17/bin/java" ]]; then
  export JAVA_HOME="$HOME/.local/share/anor-tools/jdk-17"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

npx --no-install expo prebuild --platform android --no-install --no-clean
if [[ "${2:-debug}" == "--standalone" ]]; then
  # Embedded JS; retain the installed preview's signing identity and local data.
  ./android/gradlew -p android :app:assembleRelease --no-daemon --no-parallel \
    --max-workers=1 --console=plain \
    -Pandroid.enableMinifyInReleaseBuilds=false \
    -Pandroid.enableShrinkResourcesInReleaseBuilds=false
else
  ./android/gradlew -p android :app:assembleDebug --no-daemon --no-parallel \
    --max-workers=1 --console=plain
fi
