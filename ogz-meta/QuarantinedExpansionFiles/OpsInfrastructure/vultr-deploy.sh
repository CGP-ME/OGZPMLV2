#!/bin/bash
# OGZ Prime Vultr Ubuntu Server Deployment
# SECURE DEPLOYMENT - NO API KEYS IN FILES

echo "🚀 OGZ Prime Vultr Deployment Starting..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nginx nodejs npm git ufw fail2ban

# Configure firewall (basic security)
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443

# Create application directory
sudo mkdir -p /var/www/ogz-prime
sudo chown $USER:$USER /var/www/ogz-prime

# Copy dashboard files (no sensitive data)
cp ogz-ultimate-dashboard.html /var/www/ogz-prime/index.html
cp -r ui/ /var/www/ogz-prime/ 2>/dev/null || echo "UI folder not found, skipping"
cp -r public/ /var/www/ogz-prime/ 2>/dev/null || echo "Public folder not found, skipping"

# Create nginx configuration
sudo tee /etc/nginx/sites-available/ogz-prime << 'EOF'
server {
    listen 80;
    server_name _;
    
    root /var/www/ogz-prime;
    index index.html;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=dashboard:10m rate=10r/m;
    limit_req zone=dashboard burst=5 nodelay;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # Block access to sensitive files
    location ~ /\. {
        deny all;
    }
    
    location ~ \.(log|conf)$ {
        deny all;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/ogz-prime /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "✅ Nginx configured successfully"
else
    echo "❌ Nginx configuration error"
    exit 1
fi

# Configure fail2ban for SSH protection
sudo tee /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Set proper permissions
sudo chown -R www-data:www-data /var/www/ogz-prime
sudo chmod -R 755 /var/www/ogz-prime

echo "🔐 OGZ Prime deployed on Vultr Ubuntu!"
echo "📍 Access via: http://YOUR_SERVER_IP"
echo "⚠️  Remember to manually enter your 4 memory-stored API keys when prompted"
echo "🛡️  Security: Firewall enabled, fail2ban active, nginx hardened"
