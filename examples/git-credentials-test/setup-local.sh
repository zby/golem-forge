#!/bin/bash
# Set up local git repos for credential testing
# Creates a bare "remote" and a working repo that pushes to it

set -e

TEST_DIR="/tmp/golem-git-test"
REMOTE_DIR="$TEST_DIR/remote.git"
REPO_DIR="$TEST_DIR/repo"

echo "Setting up git credential test environment..."

# Clean up any previous test
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

# Create bare repo (acts as remote)
echo "Creating bare repo at $REMOTE_DIR..."
git init --bare "$REMOTE_DIR"

# Create working repo
echo "Creating repo at $REPO_DIR..."
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"
git init -b main  # Use 'main' as branch name

# Configure repo
git config user.name "Test User"
git config user.email "test@example.com"

# Add the bare repo as remote (mimics SSH remote URL pattern)
git remote add origin "$REMOTE_DIR"

# Create initial commit
echo "# Golem Git Test" > README.md
echo "" >> README.md
echo "This repo tests git credential inheritance." >> README.md
git add README.md
git commit -m "Initial commit"

# Push to establish the branch
git push -u origin main

echo ""
echo "Setup complete!"
echo ""
echo "  Remote (bare): $REMOTE_DIR"
echo "  Repo:          $REPO_DIR"
echo ""
echo "Run the test with:"
echo "  npx tsx examples/git-credentials-test/run-local-test.ts"
