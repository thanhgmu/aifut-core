#!/usr/bin/env bash
# publish-python-sdk.sh — Build and publish aifut-connector-sdk to PyPI
# Usage:
#   ./scripts/publish-python-sdk.sh              # interactive (prompt for version)
#   ./scripts/publish-python-sdk.sh 0.2.0         # publish specific version
#   ./scripts/publish-python-sdk.sh test          # publish to Test PyPI first
#   PYPI_TOKEN=<token> ./scripts/publish-python-sdk.sh  # non-interactive

set -euo pipefail
cd "$(dirname "$0")/../packages/connector-sdk-python"

CURRENT_VERSION=$(python -c "from aifut_connector_sdk import __version__; print(__version__)")
echo "📦 aifut-connector-sdk — Current version: $CURRENT_VERSION"

# Version bump
if [ $# -ge 1 ] && [ "$1" != "test" ]; then
    NEW_VERSION="$1"
    echo "🔄 Bumping to $NEW_VERSION..."
    sed -i.bak "s/__version__ = \"$CURRENT_VERSION\"/__version__ = \"$NEW_VERSION\"/" src/aifut_connector_sdk/__init__.py
    sed -i.bak "s/version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" pyproject.toml
    rm -f src/aifut_connector_sdk/__init__.py.bak pyproject.toml.bak
    echo "✅ Version bumped to $NEW_VERSION"
fi

# Clean previous builds
echo "🧹 Cleaning..."
rm -rf dist/ build/ *.egg-info

# Build
echo "🔨 Building..."
python -m build --sdist --wheel .

# Check
echo "🔍 Checking..."
twine check dist/*

# Publish
if [ $# -ge 1 ] && [ "$1" = "test" ]; then
    echo "🧪 Publishing to Test PyPI..."
    twine upload --repository-url https://test.pypi.org/legacy/ dist/*
    echo "✅ Published to Test PyPI: https://test.pypi.org/project/aifut-connector-sdk/"
else
    echo "🚀 Publishing to PyPI..."
    twine upload dist/*
    echo "✅ Published to PyPI: https://pypi.org/project/aifut-connector-sdk/"
fi

echo "📦 Done! Version: ${NEW_VERSION:-$CURRENT_VERSION}"
