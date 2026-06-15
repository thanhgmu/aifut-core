.PHONY: build publish clean test

# Build wheel and source distribution
build:
	python -m build --sdist --wheel .

# Upload to PyPI (requires API token in TWINE_PASSWORD env)
publish: build
	twine upload dist/*

# Build and publish to PyPI test server first
publish-test: build
	twine upload --repository-url https://test.pypi.org/legacy/ dist/*

# Clean build artifacts
clean:
	rm -rf dist/ build/ *.egg-info .pytest_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Run tests
test:
	python -m pytest tests/ -v --tb=short

# Format code
fmt:
	ruff check --fix src/ tests/

# Lint check
lint:
	ruff check src/ tests/
	mypy src/ --ignore-missing-imports

# Install dev dependencies
dev:
	pip install -e ".[dev]"
