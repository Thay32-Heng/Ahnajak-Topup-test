#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_PATH="/var/log/ahnajak-installer.log"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}* Run as root: sudo bash deploy.sh${NC}"
  exit 1
fi

error() { echo -e "${RED}[✗] $1${NC}"; }
info() { echo -e "${BLUE}[*] $1${NC}"; }
success() { echo -e "${GREEN}[✓] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_PATH"
}

clear
echo -e "${BLUE}=====================================================================${NC}"
echo -e "              AHNAJAK TOPUP INSTALLER                                   "
echo -e "${BLUE}=====================================================================${NC}"

show_menu() {
  echo -e "\nWhat would you like to do?"
  echo -e " [0] Install Ahnajak Topup (Full Setup)"
  echo -e " [1] Setup/Renew Let's Encrypt SSL"
  echo -e " [2] Uninstall Ahnajak Topup"
  echo -e " [3] Update Existing Installation (pull, migrate, build, restart)"
  echo -e " [4] Add Another Domain (alongside existing sites)"
  echo -e " [5] Exit\n"
  read -p "* Input option (0-5): " OPTION
}

check_mysql() {
  if ! [ -x "$(command -v mysql)" ]; then
    info "MySQL not installed. Installing..."
    apt install -y mysql-server
  fi

  if ! systemctl is-active --quiet mysql; then
    info "Starting MySQL..."
    systemctl start mysql 2>/dev/null || {
      warn "MySQL failed to start. Reinstalling..."
      systemctl stop mysql 2>/dev/null || true
      apt remove --purge mysql-server -y 2>/dev/null || true
      rm -rf /var/lib/mysql /var/log/mysql 2>/dev/null || true
      apt install -y mysql-server
      systemctl start mysql || {
        error "MySQL cannot start. Check: journalctl -xeu mysql.service"
        exit 1
      }
    }
  fi
  success "MySQL is running"
}

run_migrations() {
  local DB_NAME="$1"
  info "Running database migrations..."
  mysql "$DB_NAME" <<SQL
CREATE TABLE IF NOT EXISTS event_banners (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  title       VARCHAR(255) DEFAULT NULL,
  image       TEXT         NOT NULL,
  link        TEXT         DEFAULT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
SQL
  success "Migrations applied"
}

update_app() {
  log "Starting update"
  read -p "Domain (e.g. kesortopup.cam): " DOMAIN_NAME
  APP_DIR="/var/www/${DOMAIN_NAME}"
  if [ ! -d "$APP_DIR" ]; then
    error "Directory ${APP_DIR} not found"
    exit 1
  fi

  cd "$APP_DIR"

  info "Pulling latest code..."
  git stash 2>/dev/null || true
  git pull origin main
  success "Code updated"

  info "Installing npm packages..."
  npm install --loglevel=error
  success "npm packages installed"

  run_migrations "${DB_NAME:-ahnajak_topup}"

  info "Building frontend..."
  npm run build
  success "Frontend built"

  info "Restarting PM2..."
  pm2 restart "${DOMAIN_NAME}-api" 2>/dev/null || pm2 start server/index.cjs --name "${DOMAIN_NAME}-api"
  pm2 save
  success "${DOMAIN_NAME}-api restarted"

  echo -e "\n${GREEN}✓ Update complete for ${DOMAIN_NAME}${NC}"
  log "Update complete for ${DOMAIN_NAME}"
}

create_swap() {
  TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$TOTAL_MEM" -lt 1024 ] && [ ! -f /swapfile ]; then
    info "Creating 2GB swap..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    success "Swap created"
  fi
}

install_app() {
  log "Starting installation"

  echo -e "\n${BLUE}>>> [STEP 1/6] Configuration${NC}"
  read -p "Domain (e.g. kesortopup.cam): " DOMAIN_NAME
  DOMAIN_NAME=${DOMAIN_NAME:-example.com}
  APP_DIR="/var/www/${DOMAIN_NAME}"

  read -p "API port [3010]: " APP_PORT
  APP_PORT=${APP_PORT:-3010}

  read -p "Database name [ahnajak_topup]: " DB_NAME
  DB_NAME=${DB_NAME:-ahnajak_topup}

  read -p "Database user [ahnajak]: " DB_USER
  DB_USER=${DB_USER:-ahnajak}

  SUGGESTED_DB_PASS=$(openssl rand -hex 12)
  read -p "Database password [$SUGGESTED_DB_PASS]: " DB_PASSWORD
  DB_PASSWORD=${DB_PASSWORD:-$SUGGESTED_DB_PASS}

  read -p "Admin email [admin@ahnajak.com]: " ADMIN_EMAIL
  ADMIN_EMAIL=${ADMIN_EMAIL:-admin@ahnajak.com}

  SUGGESTED_ADMIN_PASS="admin$(openssl rand -hex 4)"
  read -p "Admin password [$SUGGESTED_ADMIN_PASS]: " ADMIN_PASSWORD
  ADMIN_PASSWORD=${ADMIN_PASSWORD:-$SUGGESTED_ADMIN_PASS}

  read -p "Email for Let's Encrypt: " EMAIL_ADDR

  echo -e "\n${BLUE}>>> [STEP 2/6] System Dependencies${NC}" | tee -a "$LOG_PATH"
  create_swap

  apt update && apt upgrade -y
  apt install -y curl git nginx certbot python3-certbot-nginx

  if ! [ -x "$(command -v node)" ]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  fi
  success "Node.js $(node -v)"

  # MySQL with health check
  apt install -y mysql-server
  check_mysql

  echo -e "\n${BLUE}>>> [STEP 3/6] Database Setup${NC}" | tee -a "$LOG_PATH"
  mysql <<SQL
DROP DATABASE IF EXISTS \`${DB_NAME}\`;
CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP USER IF EXISTS '${DB_USER}'@'localhost';
CREATE USER '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  success "Database '${DB_NAME}' created"

  echo -e "\n${BLUE}>>> [STEP 4/6] Application Deploy${NC}" | tee -a "$LOG_PATH"
  mkdir -p "$APP_DIR"
  if [ "$(pwd)" != "$APP_DIR" ]; then
    cp -r . "$APP_DIR"
  fi
  cd "$APP_DIR"

  JWT_SECRET=$(openssl rand -hex 32)
  cat > .env <<EOT
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
PORT=${APP_PORT}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
PUBLIC_BASE_URL=https://${DOMAIN_NAME}
FRONTEND_URL=https://${DOMAIN_NAME}
ALLOWED_ORIGINS=https://${DOMAIN_NAME}
EOT
  success ".env configured"

  info "Installing npm packages..."
  npm install --loglevel=error
  success "npm packages installed"

  info "Running database seed (creates tables + default data)..."
  node scripts/seed.cjs
  success "Database seeded"

  run_migrations "$DB_NAME"

  # Set custom admin credentials
  info "Setting admin credentials..."
  BCRYPT_HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('${ADMIN_PASSWORD}', 10));")
  mysql "$DB_NAME" -e "UPDATE users SET email = '${ADMIN_EMAIL}', password_hash = '${BCRYPT_HASH}' WHERE email = 'admin@ahnajak.com';"
  success "Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"

  info "Building frontend..."
  npm run build
  success "Frontend built"

  echo -e "\n${BLUE}>>> [STEP 5/6] Nginx Configuration${NC}" | tee -a "$LOG_PATH"
  rm -f /etc/nginx/sites-enabled/default

  cat > /etc/nginx/sites-available/${DOMAIN_NAME} <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME} www.${DOMAIN_NAME};

    location / {
        return 301 https://\$host\$request_uri;
    }

    location ^~ /.well-known/acme-challenge/ {
        root ${APP_DIR}/dist;
        default_type "text/plain";
        allow all;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_NAME} www.${DOMAIN_NAME};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1440m;

    root ${APP_DIR}/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/${DOMAIN_NAME} /etc/nginx/sites-enabled/
  success "Nginx config created"

  echo -e "\n${BLUE}>>> [STEP 6/6] SSL, PM2 & Firewall${NC}" | tee -a "$LOG_PATH"

  # SSL
  if [ -n "$EMAIL_ADDR" ]; then
    info "Getting SSL certificate..."
    certbot --nginx --non-interactive --agree-tos -m "$EMAIL_ADDR" -d "$DOMAIN_NAME" -d "www.$DOMAIN_NAME" || warn "SSL failed — run option [1] later"
  fi

  nginx -t && systemctl restart nginx
  success "Nginx running"

  # PM2
  npm install -g pm2 --silent
  pm2 delete "${DOMAIN_NAME}-api" 2>/dev/null || true
  pm2 start server/index.cjs --name "${DOMAIN_NAME}-api"
  pm2 save
  pm2 startup 2>/dev/null || true
  success "PM2 started — ${DOMAIN_NAME}-api on port ${APP_PORT}"

  # Firewall
  ufw default deny incoming 2>/dev/null
  ufw default allow outgoing 2>/dev/null
  ufw allow ssh 2>/dev/null
  ufw allow http 2>/dev/null
  ufw allow https 2>/dev/null
  echo "y" | ufw enable 2>/dev/null || true
  success "Firewall configured"

  clear
  echo -e "${GREEN}=====================================================================${NC}"
  echo -e "       AHNAJAK TOPUP INSTALLED SUCCESSFULLY!                           "
  echo -e "${GREEN}=====================================================================${NC}"
  echo -e " Website:   https://${DOMAIN_NAME}"
  echo -e " Admin:     https://${DOMAIN_NAME}/auth"
  echo -e " Email:     ${ADMIN_EMAIL}"
  echo -e " Password:  ${YELLOW}${ADMIN_PASSWORD}${NC}"
  echo -e "${GREEN}=====================================================================${NC}"
  log "Installation complete for ${DOMAIN_NAME}"
}

add_domain() {
  log "Adding another domain"
  echo -e "\n${BLUE}>>> Configuration${NC}"
  read -p "New domain (e.g. woosaastore.com): " DOMAIN_NAME
  DOMAIN_NAME=${DOMAIN_NAME:-example.com}
  APP_DIR="/var/www/${DOMAIN_NAME}"

  read -p "API port [3020]: " APP_PORT
  APP_PORT=${APP_PORT:-3020}

  read -p "New database name [${DOMAIN_NAME//./_}_db]: " DB_NAME
  DB_NAME=${DB_NAME:-${DOMAIN_NAME//./_}_db}

  read -p "Database user [${DOMAIN_NAME//./_}]: " DB_USER
  DB_USER=${DB_USER:-${DOMAIN_NAME//./_}}

  SUGGESTED_DB_PASS=$(openssl rand -hex 12)
  read -p "Database password [$SUGGESTED_DB_PASS]: " DB_PASSWORD
  DB_PASSWORD=${DB_PASSWORD:-$SUGGESTED_DB_PASS}

  read -p "Admin email [admin@${DOMAIN_NAME}]: " ADMIN_EMAIL
  ADMIN_EMAIL=${ADMIN_EMAIL:-admin@${DOMAIN_NAME}}

  SUGGESTED_ADMIN_PASS="admin$(openssl rand -hex 4)"
  read -p "Admin password [$SUGGESTED_ADMIN_PASS]: " ADMIN_PASSWORD
  ADMIN_PASSWORD=${ADMIN_PASSWORD:-$SUGGESTED_ADMIN_PASS}

  read -p "Email for Let's Encrypt: " EMAIL_ADDR

  # Database
  echo -e "\n${BLUE}>>> Database Setup${NC}" | tee -a "$LOG_PATH"
  mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP USER IF EXISTS '${DB_USER}'@'localhost';
CREATE USER '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  success "Database '${DB_NAME}' created"

  # Deploy app
  echo -e "\n${BLUE}>>> Application Deploy${NC}" | tee -a "$LOG_PATH"
  mkdir -p "$APP_DIR"
  if [ "$(pwd)" != "$APP_DIR" ]; then
    cp -r . "$APP_DIR"
  fi
  cd "$APP_DIR"

  JWT_SECRET=$(openssl rand -hex 32)
  cat > .env <<EOT
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
PORT=${APP_PORT}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
PUBLIC_BASE_URL=https://${DOMAIN_NAME}
FRONTEND_URL=https://${DOMAIN_NAME}
ALLOWED_ORIGINS=https://${DOMAIN_NAME}
EOT
  success ".env configured"

  info "Installing npm packages..."
  npm install --loglevel=error
  success "npm packages installed"

  info "Running database seed..."
  node scripts/seed.cjs
  success "Database seeded"

  BCRYPT_HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('${ADMIN_PASSWORD}', 10));")
  mysql "$DB_NAME" -e "UPDATE users SET email = '${ADMIN_EMAIL}', password_hash = '${BCRYPT_HASH}' WHERE email = 'admin@ahnajak.com';"
  success "Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"

  info "Building frontend..."
  npm run build
  success "Frontend built"

  # Nginx — create separate config, do NOT remove existing sites
  echo -e "\n${BLUE}>>> Nginx Configuration${NC}" | tee -a "$LOG_PATH"
  cat > /etc/nginx/sites-available/${DOMAIN_NAME} <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_NAME} www.${DOMAIN_NAME};

    location / {
        return 301 https://\$host\$request_uri;
    }

    location ^~ /.well-known/acme-challenge/ {
        root ${APP_DIR}/dist;
        default_type "text/plain";
        allow all;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_NAME} www.${DOMAIN_NAME};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1440m;

    root ${APP_DIR}/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/${DOMAIN_NAME} /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  success "Nginx config added for ${DOMAIN_NAME}"

  # SSL
  if [ -n "$EMAIL_ADDR" ]; then
    info "Getting SSL certificate..."
    certbot --nginx --non-interactive --agree-tos -m "$EMAIL_ADDR" -d "$DOMAIN_NAME" -d "www.$DOMAIN_NAME" || warn "SSL failed — run option [1] later"
    nginx -t && systemctl reload nginx
  fi

  # PM2 — unique name per domain
  npm install -g pm2 --silent 2>/dev/null
  pm2 delete "${DOMAIN_NAME}-api" 2>/dev/null || true
  pm2 start server/index.cjs --name "${DOMAIN_NAME}-api"
  pm2 save
  success "PM2 started — ${DOMAIN_NAME}-api on port ${APP_PORT}"

  clear
  echo -e "${GREEN}=====================================================================${NC}"
  echo -e "       DOMAIN ADDED SUCCESSFULLY!                                     "
  echo -e "${GREEN}=====================================================================${NC}"
  echo -e " Website:   https://${DOMAIN_NAME}"
  echo -e " Admin:     https://${DOMAIN_NAME}/auth"
  echo -e " Email:     ${ADMIN_EMAIL}"
  echo -e " Password:  ${YELLOW}${ADMIN_PASSWORD}${NC}"
  echo -e " API Port:  ${APP_PORT}"
  echo -e "${GREEN}=====================================================================${NC}"
  log "Domain ${DOMAIN_NAME} added on port ${APP_PORT}"
}

setup_ssl_only() {
  read -p "Domain: " DOM_NAME
  read -p "Email: " E_ADDR
  if [ -z "$DOM_NAME" ] || [ -z "$E_ADDR" ]; then
    error "Domain and email required"
    return
  fi
  apt install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos -m "$E_ADDR" -d "$DOM_NAME" -d "www.$DOM_NAME" || certbot --nginx --non-interactive --agree-tos -m "$E_ADDR" -d "$DOM_NAME"
  success "SSL enabled for ${DOM_NAME}"
}

uninstall_app() {
  read -p "Domain to uninstall: " DOM_NAME
  read -p "Delete database too? (y/N): " DEL_DB
  read -p "Are you sure? (y/N): " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Stopping PM2..."
    pm2 delete "${DOMAIN_NAME}-api" 2>/dev/null || true
    pm2 save
    info "Removing nginx config..."
    rm -f "/etc/nginx/sites-enabled/${DOM_NAME}" "/etc/nginx/sites-available/${DOM_NAME}"
    systemctl restart nginx
    if [[ "$DEL_DB" =~ ^[Yy]$ ]]; then
      read -p "Database name: " DB_NAME
      mysql -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;" 2>/dev/null || warn "Database not found"
      success "Database deleted"
    fi
    rm -rf "/var/www/${DOM_NAME}"
    success "${DOM_NAME} uninstalled"
    log "Uninstalled ${DOM_NAME}"
  fi
}

show_menu
case "$OPTION" in
  0) install_app ;;
  1) setup_ssl_only ;;
  2) uninstall_app ;;
  3) update_app ;;
  4) add_domain ;;
  *) echo "Exiting."; exit 0 ;;
esac
