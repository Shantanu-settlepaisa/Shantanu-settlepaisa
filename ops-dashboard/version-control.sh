#!/bin/bash

# Version Control System for Ops Dashboard
# Manages backups and rollbacks for different versions

show_help() {
    echo "📚 Version Control System for Ops Dashboard"
    echo "==========================================="
    echo ""
    echo "Usage: ./version-control.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  list           List all available backups"
    echo "  backup         Create a new backup of current state"
    echo "  rollback       Restore to a specific version"
    echo "  info           Show information about a backup"
    echo "  compare        Compare current state with a backup"
    echo "  clean          Remove old backups (keeps last 5)"
    echo ""
    echo "Examples:"
    echo "  ./version-control.sh list"
    echo "  ./version-control.sh backup"
    echo "  ./version-control.sh rollback v2.1.0"
    echo "  ./version-control.sh info versions/v2.1.0_20250918_084808"
    echo ""
}

list_backups() {
    echo "📦 Available Backups:"
    echo "===================="
    
    if [ ! -d "versions" ]; then
        echo "No backups found."
        return
    fi
    
    for dir in versions/*/; do
        if [ -d "$dir" ]; then
            basename_dir=$(basename "$dir")
            if [ -f "$dir/manifest.json" ]; then
                version=$(cat "$dir/manifest.json" | python3 -c "import sys, json; print(json.load(sys.stdin).get('version', 'unknown'))" 2>/dev/null)
                name=$(cat "$dir/manifest.json" | python3 -c "import sys, json; print(json.load(sys.stdin).get('name', 'unknown'))" 2>/dev/null)
                timestamp=$(cat "$dir/manifest.json" | python3 -c "import sys, json; print(json.load(sys.stdin).get('timestamp', 'unknown'))" 2>/dev/null)
                echo "  📁 $basename_dir"
                echo "     Version: $version - $name"
                echo "     Created: $timestamp"
                echo ""
            else
                echo "  📁 $basename_dir (no manifest)"
                echo ""
            fi
        fi
    done
}

create_backup() {
    echo "🔵 Creating backup of current state..."
    
    # Determine version from latest VERSION file
    latest_version_file=$(ls -1 VERSION_*.md 2>/dev/null | sort -r | head -1)
    if [ -n "$latest_version_file" ]; then
        version=$(echo "$latest_version_file" | grep -oE 'VERSION_[0-9]+\.[0-9]+\.[0-9]+' | sed 's/VERSION_//')
        echo "  Detected version: $version"
    else
        version="2.1.0"
        echo "  Using default version: $version"
    fi
    
    # Run the backup script if it exists
    if [ -f "backup-v${version}.sh" ]; then
        ./backup-v${version}.sh
    else
        # Generic backup
        timestamp=$(date +%Y%m%d_%H%M%S)
        backup_dir="versions/v${version}_${timestamp}"
        mkdir -p "$backup_dir"
        
        # Backup key files
        echo "  Backing up files to $backup_dir..."
        
        # Backend
        mkdir -p "$backup_dir/services/overview-api"
        cp -r services/overview-api/*.js "$backup_dir/services/overview-api/" 2>/dev/null || true
        
        # Frontend
        mkdir -p "$backup_dir/src"
        cp -r src/components "$backup_dir/src/" 2>/dev/null || true
        cp -r src/pages "$backup_dir/src/" 2>/dev/null || true
        cp -r src/hooks "$backup_dir/src/" 2>/dev/null || true
        cp src/router.tsx "$backup_dir/src/" 2>/dev/null || true
        
        # Config files
        cp package.json tsconfig.json vite.config.ts tailwind.config.js "$backup_dir/" 2>/dev/null || true
        
        # Create manifest
        cat > "$backup_dir/manifest.json" << EOF
{
  "version": "$version",
  "name": "Manual Backup",
  "timestamp": "$timestamp",
  "description": "Backup created via version-control.sh"
}
EOF
        
        echo "✅ Backup created: $backup_dir"
    fi
}

rollback_to_version() {
    local target_version=$1
    
    if [ -z "$target_version" ]; then
        echo "❌ Please specify a version to rollback to"
        echo "   Example: ./version-control.sh rollback v2.1.0"
        return 1
    fi
    
    # Find matching backup
    if [[ "$target_version" == *"/"* ]]; then
        # Full path provided
        backup_dir="$target_version"
    else
        # Version number provided, find latest backup for that version
        backup_dir=$(ls -d versions/${target_version}_* 2>/dev/null | sort -r | head -1)
    fi
    
    if [ ! -d "$backup_dir" ]; then
        echo "❌ No backup found for version: $target_version"
        echo "   Available versions:"
        ls -d versions/v* 2>/dev/null | sed 's/versions\//  - /'
        return 1
    fi
    
    echo "🔄 Rolling back to: $backup_dir"
    
    # Use specific rollback script if available
    version_num=$(echo "$backup_dir" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -f "rollback-${version_num}-complete.sh" ]; then
        ./rollback-${version_num}-complete.sh "$backup_dir"
    elif [ -f "rollback-${version_num}.sh" ]; then
        ./rollback-${version_num}.sh "$backup_dir"
    else
        # Generic rollback
        echo "⚠️  No specific rollback script found, using generic rollback..."
        
        # Stop services
        echo "🛑 Stopping services..."
        lsof -ti:5105 | xargs kill -9 2>/dev/null || true
        lsof -ti:5103 | xargs kill -9 2>/dev/null || true
        lsof -ti:5102 | xargs kill -9 2>/dev/null || true
        lsof -ti:5101 | xargs kill -9 2>/dev/null || true
        
        # Restore files
        echo "📥 Restoring files..."
        [ -d "$backup_dir/services" ] && cp -r "$backup_dir/services/"* services/ 2>/dev/null || true
        [ -d "$backup_dir/src" ] && cp -r "$backup_dir/src/"* src/ 2>/dev/null || true
        
        # Restart services
        echo "🔄 Restarting services..."
        cd services/overview-api && node index.js > /tmp/overview-api.log 2>&1 &
        cd ../..
        
        echo "✅ Rollback completed"
    fi
}

show_info() {
    local backup_dir=$1
    
    if [ -z "$backup_dir" ]; then
        echo "❌ Please specify a backup directory"
        return 1
    fi
    
    if [ ! -d "$backup_dir" ]; then
        echo "❌ Backup directory not found: $backup_dir"
        return 1
    fi
    
    echo "📋 Backup Information"
    echo "===================="
    echo "Directory: $backup_dir"
    echo ""
    
    if [ -f "$backup_dir/manifest.json" ]; then
        echo "Manifest:"
        cat "$backup_dir/manifest.json" | python3 -m json.tool
    else
        echo "No manifest file found"
    fi
    
    echo ""
    echo "Files:"
    find "$backup_dir" -type f | wc -l | xargs echo "  Total files:"
    echo "  Components: $(find "$backup_dir" -name "*.tsx" | wc -l | tr -d ' ')"
    echo "  Services: $(find "$backup_dir" -name "*.js" | wc -l | tr -d ' ')"
    echo "  Configs: $(find "$backup_dir" -name "*.json" | wc -l | tr -d ' ')"
}

compare_with_backup() {
    local backup_dir=$1
    
    if [ -z "$backup_dir" ]; then
        echo "❌ Please specify a backup directory to compare"
        return 1
    fi
    
    if [ ! -d "$backup_dir" ]; then
        echo "❌ Backup directory not found: $backup_dir"
        return 1
    fi
    
    echo "🔍 Comparing current state with: $backup_dir"
    echo "============================================"
    
    # Compare key files
    echo ""
    echo "Changed files:"
    
    for file in $(find "$backup_dir" -type f -name "*.js" -o -name "*.ts" -o -name "*.tsx"); do
        relative_path=${file#$backup_dir/}
        if [ -f "$relative_path" ]; then
            if ! diff -q "$file" "$relative_path" > /dev/null 2>&1; then
                echo "  ≠ $relative_path"
            fi
        else
            echo "  - $relative_path (deleted)"
        fi
    done
    
    echo ""
    echo "Use 'diff' command for detailed comparison of specific files"
}

clean_old_backups() {
    echo "🧹 Cleaning old backups..."
    
    if [ ! -d "versions" ]; then
        echo "No backups to clean"
        return
    fi
    
    # Keep only the 5 most recent backups per version
    for version in $(ls versions/ | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -u); do
        echo "  Processing version $version..."
        backups=$(ls -d versions/${version}_* 2>/dev/null | sort -r)
        count=0
        for backup in $backups; do
            count=$((count + 1))
            if [ $count -gt 5 ]; then
                echo "    Removing old backup: $backup"
                rm -rf "$backup"
            fi
        done
    done
    
    echo "✅ Cleanup completed"
}

# Main command handling
case "$1" in
    list|ls)
        list_backups
        ;;
    backup|save)
        create_backup
        ;;
    rollback|restore)
        rollback_to_version "$2"
        ;;
    info|show)
        show_info "$2"
        ;;
    compare|diff)
        compare_with_backup "$2"
        ;;
    clean|cleanup)
        clean_old_backups
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac