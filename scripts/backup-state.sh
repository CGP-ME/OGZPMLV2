#!/bin/bash
# Backup critical OGZ Prime state before VPS transition

BACKUP_DIR="/opt/ogzprime/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Backing up OGZ Prime state to $BACKUP_DIR"

# Critical data files
cp -r data/pattern-memory*.json "$BACKUP_DIR/" 2>/dev/null || true
cp -r data/journal/ "$BACKUP_DIR/journal/" 2>/dev/null || true
cp -r data/pipeline-snapshots.jsonl "$BACKUP_DIR/" 2>/dev/null || true
cp .env "$BACKUP_DIR/.env.backup" 2>/dev/null || true

# PM2 ecosystem
pm2 save
cp ~/.pm2/dump.pm2 "$BACKUP_DIR/pm2-dump.pm2" 2>/dev/null || true

# Git state
git rev-parse HEAD > "$BACKUP_DIR/git-commit.txt"
git branch --show-current > "$BACKUP_DIR/git-branch.txt"
git stash list > "$BACKUP_DIR/git-stash.txt" 2>/dev/null || true

# Nginx config
sudo cp /etc/nginx/sites-enabled/ogzprime.conf "$BACKUP_DIR/" 2>/dev/null || true

echo ""
echo "✅ Backup complete: $BACKUP_DIR"
ls -la "$BACKUP_DIR"

# Create tarball
TARBALL="/opt/ogzprime/backups/ogzprime-backup-$(date +%Y%m%d_%H%M%S).tar.gz"
tar -czf "$TARBALL" -C "$(dirname $BACKUP_DIR)" "$(basename $BACKUP_DIR)"
echo ""
echo "📁 Tarball: $TARBALL"
echo "   Size: $(du -h $TARBALL | cut -f1)"
