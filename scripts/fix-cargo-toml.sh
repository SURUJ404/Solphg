#!/bin/sh
cat > /tmp/lockfile-gen2/Cargo.toml << 'EOF'
[workspace]
members = ["programs/*"]
resolver = "2"
[profile.release]
overflow-checks = true
EOF
