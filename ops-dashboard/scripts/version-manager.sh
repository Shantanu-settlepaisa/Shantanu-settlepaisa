#!/bin/bash

# Version Management Script for Ops Dashboard
# Provides version tagging, backup, and rollback capabilities

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/VERSION"
BACKUP_DIR="$PROJECT_ROOT/.backups"
CHANGELOG_FILE="$PROJECT_ROOT/CHANGELOG.md"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Function to display help
show_help() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  current          - Show current version"
    echo "  list             - List all versions"
    echo "  tag <version>    - Create a new version tag"
    echo "  backup           - Create a backup of current state"
    echo "  rollback <version> - Rollback to a specific version"
    echo "  compare <v1> <v2> - Compare two versions"
    echo "  export <version>  - Export a version as tarball"
    echo "  help             - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 tag 2.1.1"
    echo "  $0 rollback 2.1.0"
    echo "  $0 backup"
}

# Function to get current version
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE"
    else
        echo "0.0.0"
    fi
}

# Function to validate version format
validate_version() {
    local version=$1
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}Error: Invalid version format. Use semantic versioning (e.g., 2.1.0)${NC}"
        exit 1
    fi
}

# Function to create a git tag
create_version_tag() {
    local version=$1
    local message=${2:-"Release version $version"}
    
    validate_version "$version"
    
    # Check if tag already exists
    if git tag | grep -q "^v$version$"; then
        echo -e "${RED}Error: Version v$version already exists${NC}"
        exit 1
    fi
    
    # Update VERSION file
    echo "$version" > "$VERSION_FILE"
    
    # Create changelog entry
    create_changelog_entry "$version"
    
    # Commit changes
    git add "$VERSION_FILE" "$CHANGELOG_FILE"
    git commit -m "Release version $version

- Tagged version: v$version
- Updated VERSION file
- Added CHANGELOG entry

🤖 Generated with Version Manager" || true
    
    # Create git tag
    git tag -a "v$version" -m "$message"
    
    echo -e "${GREEN}✓ Created version tag v$version${NC}"
    echo -e "${BLUE}To push the tag to remote: git push origin v$version${NC}"
}

# Function to create changelog entry
create_changelog_entry() {
    local version=$1
    local date=$(date +"%Y-%m-%d")
    local entry="## [$version] - $date

### Added
- Recon Rule Settings feature with feature flag
- Backend API endpoints for recon rules at /api/recon-rules
- UI components for rule management in Settings page
- Version management system with rollback capability

### Fixed
- Manual Upload page data display issues (Bank Amount and Status columns)
- Exceptions tab filtering to show only exception items
- Tab counts matching actual displayed results
- Status normalization between API and frontend

### Changed
- Removed client-side filtering in ReconResultsTable (API handles filtering)
- Updated status conversion to properly handle API response values

"
    
    if [ ! -f "$CHANGELOG_FILE" ]; then
        echo "# Changelog

All notable changes to the Ops Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

" > "$CHANGELOG_FILE"
    fi
    
    # Add new entry at the beginning of changelog content
    local temp_file=$(mktemp)
    head -n 6 "$CHANGELOG_FILE" > "$temp_file"
    echo "$entry" >> "$temp_file"
    tail -n +7 "$CHANGELOG_FILE" >> "$temp_file" 2>/dev/null || true
    mv "$temp_file" "$CHANGELOG_FILE"
}

# Function to create backup
create_backup() {
    local version=$(get_current_version)
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_name="backup_v${version}_${timestamp}"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    echo -e "${YELLOW}Creating backup: $backup_name${NC}"
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Save current git state
    git rev-parse HEAD > "$backup_path/git_commit.txt"
    git status --porcelain > "$backup_path/git_status.txt"
    
    # Backup important directories
    for dir in src services public package.json package-lock.json tsconfig.json vite.config.ts; do
        if [ -e "$PROJECT_ROOT/$dir" ]; then
            cp -r "$PROJECT_ROOT/$dir" "$backup_path/"
        fi
    done
    
    # Create backup metadata
    cat > "$backup_path/metadata.json" << EOF
{
  "version": "$version",
  "timestamp": "$timestamp",
  "date": "$(date)",
  "git_commit": "$(git rev-parse HEAD)",
  "git_branch": "$(git branch --show-current)",
  "created_by": "$(whoami)",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')"
}
EOF
    
    # Compress backup
    tar -czf "$backup_path.tar.gz" -C "$BACKUP_DIR" "$backup_name"
    rm -rf "$backup_path"
    
    echo -e "${GREEN}✓ Backup created: $backup_path.tar.gz${NC}"
}

# Function to list all versions
list_versions() {
    echo -e "${BLUE}=== Git Tags ===${NC}"
    git tag -l "v*" --sort=-version:refname | while read tag; do
        local date=$(git log -1 --format=%ai "$tag" | cut -d' ' -f1)
        local message=$(git tag -l --format='%(contents:subject)' "$tag")
        echo -e "  ${GREEN}$tag${NC} - $date - $message"
    done
    
    echo ""
    echo -e "${BLUE}=== Backups ===${NC}"
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR/*.tar.gz 2>/dev/null)" ]; then
        ls -lt "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -10 | while read line; do
            local file=$(echo "$line" | awk '{print $NF}')
            local size=$(echo "$line" | awk '{print $5}')
            local date=$(echo "$line" | awk '{print $6, $7, $8}')
            local name=$(basename "$file" .tar.gz)
            echo -e "  ${YELLOW}$name${NC} - $date - $(numfmt --to=iec-i --suffix=B $size 2>/dev/null || echo $size)"
        done
    else
        echo "  No backups found"
    fi
    
    echo ""
    echo -e "${BLUE}Current Version:${NC} $(get_current_version)"
}

# Function to rollback to a specific version
rollback_to_version() {
    local target_version=$1
    local target_tag="v$target_version"
    
    validate_version "$target_version"
    
    # Check if tag exists
    if ! git tag | grep -q "^$target_tag$"; then
        echo -e "${RED}Error: Version $target_tag not found${NC}"
        echo "Available versions:"
        git tag -l "v*" --sort=-version:refname | head -10
        exit 1
    fi
    
    # Create backup of current state
    echo -e "${YELLOW}Creating backup before rollback...${NC}"
    create_backup
    
    # Stash any uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}Stashing uncommitted changes...${NC}"
        git stash push -m "Rollback stash: Rolling back to $target_tag"
    fi
    
    # Perform rollback
    echo -e "${YELLOW}Rolling back to $target_tag...${NC}"
    git checkout "$target_tag"
    
    # Update VERSION file
    echo "$target_version" > "$VERSION_FILE"
    
    # Reinstall dependencies if package.json changed
    if git diff HEAD@{1} --name-only | grep -q "package.json"; then
        echo -e "${YELLOW}Package.json changed, reinstalling dependencies...${NC}"
        npm install
    fi
    
    echo -e "${GREEN}✓ Successfully rolled back to version $target_version${NC}"
    echo -e "${BLUE}Note: You are now in a detached HEAD state.${NC}"
    echo -e "${BLUE}To create a new branch from this version: git checkout -b <branch-name>${NC}"
    echo -e "${BLUE}To return to main branch: git checkout main${NC}"
}

# Function to compare two versions
compare_versions() {
    local v1="v$1"
    local v2="v$2"
    
    validate_version "$1"
    validate_version "$2"
    
    echo -e "${BLUE}Comparing $v1 with $v2${NC}"
    echo ""
    
    # Show commit differences
    echo -e "${YELLOW}=== Commits ===${NC}"
    git log --oneline "$v1..$v2" | head -20
    
    echo ""
    echo -e "${YELLOW}=== File Changes ===${NC}"
    git diff --stat "$v1" "$v2" | head -30
    
    echo ""
    echo -e "${YELLOW}=== Summary ===${NC}"
    git diff --shortstat "$v1" "$v2"
}

# Function to export a version
export_version() {
    local version=$1
    local tag="v$version"
    local export_dir="$PROJECT_ROOT/exports"
    local export_file="$export_dir/ops-dashboard-$version.tar.gz"
    
    validate_version "$version"
    
    # Check if tag exists
    if ! git tag | grep -q "^$tag$"; then
        echo -e "${RED}Error: Version $tag not found${NC}"
        exit 1
    fi
    
    mkdir -p "$export_dir"
    
    echo -e "${YELLOW}Exporting version $version...${NC}"
    
    # Create temporary directory
    local temp_dir=$(mktemp -d)
    
    # Export the version
    git archive --format=tar --prefix="ops-dashboard-$version/" "$tag" | tar -xf - -C "$temp_dir"
    
    # Add VERSION file
    echo "$version" > "$temp_dir/ops-dashboard-$version/VERSION"
    
    # Create tarball
    tar -czf "$export_file" -C "$temp_dir" "ops-dashboard-$version"
    
    # Cleanup
    rm -rf "$temp_dir"
    
    echo -e "${GREEN}✓ Exported to: $export_file${NC}"
}

# Main script logic
case "${1:-}" in
    current)
        echo "Current version: $(get_current_version)"
        ;;
    list)
        list_versions
        ;;
    tag)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Version number required${NC}"
            show_help
            exit 1
        fi
        create_version_tag "$2" "${3:-}"
        ;;
    backup)
        create_backup
        ;;
    rollback)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Version number required${NC}"
            show_help
            exit 1
        fi
        rollback_to_version "$2"
        ;;
    compare)
        if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
            echo -e "${RED}Error: Two version numbers required${NC}"
            show_help
            exit 1
        fi
        compare_versions "$2" "$3"
        ;;
    export)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Version number required${NC}"
            show_help
            exit 1
        fi
        export_version "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Error: Unknown command '${1:-}'${NC}"
        show_help
        exit 1
        ;;
esac