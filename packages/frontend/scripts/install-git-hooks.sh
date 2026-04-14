#!/bin/bash

# Script to install pre-commit hook for webui
# Pre-commit: formats, checks, builds, and stages build output

REPO_ROOT=$(git rev-parse --show-toplevel)
PRE_COMMIT_HOOK="$REPO_ROOT/.git/hooks/pre-commit"

echo "Installing pre-commit hook for webui..."

# Create the pre-commit hook
cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash

# Check if there are any changes in the webui directory
if git diff --cached --name-only | grep -q "^packages/frontend/"; then
    REPO_ROOT=$(git rev-parse --show-toplevel)
    cd "$REPO_ROOT/packages/frontend"

    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo "Error: package.json not found in packages/frontend"
        exit 1
    fi

    echo "Formatting and checking webui code..."

    # Run the format command
    bun run format
    if [ $? -ne 0 ]; then
        echo "Error: bun run format failed"
        exit 1
    fi

    # Run the lint command
    bun run lint
    if [ $? -ne 0 ]; then
        echo "Error: bun run lint failed"
        exit 1
    fi

    # Run the check command
    bun run check
    if [ $? -ne 0 ]; then
        echo "Error: bun run check failed"
        exit 1
    fi

    # Run the test command
    bun run test --concurrent 
    if [ $? -ne 0 ]; then
        echo "Error: bun run check failed"
        exit 1
    fi

    echo "✅ Webui code formatted and checked successfully"

    # Build the webui
    echo "Building webui..."
    bun run build
    if [ $? -ne 0 ]; then
        echo "❌ bun run build failed"
        exit 1
    fi

    # Stage the build output alongside the source changes
    cd "$REPO_ROOT"
    git add ./packages/public/

    echo "✅ Webui built and build output staged"
fi

exit 0
EOF

# Make hook executable
chmod +x "$PRE_COMMIT_HOOK"

if [ $? -eq 0 ]; then
    echo "✅ Git hook installed successfully!"
    echo "   Pre-commit: $PRE_COMMIT_HOOK"
    echo ""
    echo "The hook will automatically:"
    echo "  • Format, lint and check webui code before commits"
    echo "  • Build webui and stage packages/frontend/ into the same commit"
else
    echo "❌ Failed to make hook executable"
    exit 1
fi
