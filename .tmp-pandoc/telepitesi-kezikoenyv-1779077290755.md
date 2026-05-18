---
title: "Telepítési kézikönyv"
description: "Lépésről lépésre útmutató az Analyse platform telepítéséhez, konfigurálásához és elindításához."
---

Ez a kézikönyv végigvezet az Analyse platform (Laravel 12 / PHP 8.2) telepítésének teljes folyamatán: az előfeltételektől a rendszer éles indításáig.

## Előfeltételek

A telepítés megkezdése előtt győződj meg arról, hogy az alábbiak rendelkezésre állnak:

- **Operációs rendszer:** Linux (Ubuntu 22.04 LTS vagy Debian 12 ajánlott)
- **PHP:** 8.2\+ **Swoole extension**-nel (Octane-hez kötelező); ajánlott extensions: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`, `curl`, `zip`
- **Composer:** 2.x (PHP csomagkezelő); a `vendor/` mappa ~200–500 MB
- **Node.js:** 20 LTS \+ npm (Vite frontend build előállításához); a `node_modules/` ~100–300 MB
- **Adatbázis:** MySQL 8.0\+ (InnoDB motor, `utf8mb4` karakterkészlet)
- **Cache / Feladatsor:** Redis 7\+
- **Webszerver / Proxy:** Nginx 1.24\+ (reverse proxy — Laravel Octane Swoole elé; PHP-FPM **nem szükséges**)
- **Folyamatkezelő:** Supervisor (Laravel queue worker felügyeletéhez)
- **SSL-tanúsítvány:** Érvényes TLS-tanúsítvány a domainhez (pl. Let's Encrypt / Certbot)
- **E-mail szerver:** SMTP-hozzáférés értesítések küldéséhez (587 STARTTLS vagy 465 SSL)
- **Lemezterület:** Minimum 10 GB szabad hely (alkalmazás \+ `vendor/` \+ `node_modules/` \+ `storage/` \+ adatbázis)

## Telepítési lépések

### 1. A csomag letöltése

```bash
# Klónozd a repositoryt vagy töltsd le a kiadott csomagot
git clone https://github.com/your-org/analyse.git
cd analyse
```

### 2. Függőségek telepítése

```bash
# PHP függőségek (vendor/ mappa feltöltése)
composer install --no-dev --optimize-autoloader

# Frontend függőségek és build (node_modules/ + public/build/)
npm install
npm run build
```

### 3. Környezeti változók beállítása

Másold le a példa konfigurációs fájlt és töltsd ki a szükséges értékekkel:

```bash
cp .env.example .env
nano .env
```

A legfontosabb környezeti változók:

| Változó | Példa érték | Leírás |
| --- | --- | --- |
| `APP_NAME` | `Analyse` | Alkalmazás neve |
| `APP_ENV` | `production` | Környezet (`local` / `production`) |
| `APP_KEY` | _(generált — `php artisan key:generate`)_ | Laravel titkosítási kulcs |
| `APP_URL` | `https://analyse.example.com` | Az alkalmazás nyilvános URL-je |
| `DB_CONNECTION` | `mysql` | Laravel adatbázis driver |
| `DB_HOST` | `127.0.0.1` | MySQL szerver hosztneve |
| `DB_PORT` | `3306` | MySQL port |
| `DB_DATABASE` | `analyse_production` | Adatbázis neve |
| `DB_USERNAME` | `analyse_user` | MySQL felhasználónév |
| `DB_PASSWORD` | `erős_jelszó` | MySQL jelszó |
| `CACHE_STORE` | `redis` | Cache backend |
| `SESSION_DRIVER` | `redis` | Session backend |
| `QUEUE_CONNECTION` | `redis` | Queue backend |
| `REDIS_HOST` | `127.0.0.1` | Redis szerver hosztneve |
| `REDIS_PORT` | `6379` | Redis port |
| `MAIL_MAILER` | `smtp` | E-mail driver |
| `MAIL_HOST` | `smtp.example.com` | SMTP szerver hosztneve |
| `MAIL_PORT` | `587` | SMTP port (587 STARTTLS vagy 465 SSL) |
| `MAIL_USERNAME` | `noreply@example.com` | SMTP felhasználónév |
| `MAIL_PASSWORD` | _(SMTP jelszó)_ | SMTP jelszó |
| `MAIL_FROM_ADDRESS` | `noreply@example.com` | Feladó e-mail cím |
| `FILESYSTEM_DISK` | `local` vagy `s3` | Fájltároló típusa |
| `AWS_ENDPOINT` | `https://minio.example.com` | S3/MinIO végpont URL (ha `s3`) |
| `AWS_BUCKET` | `analyse-exports` | S3 bucket neve |
| `AWS_ACCESS_KEY_ID` | _(kulcs)_ | S3 hozzáférési kulcs |
| `AWS_SECRET_ACCESS_KEY` | _(titkos kulcs)_ | S3 titkos kulcs |
| `BROADCAST_CONNECTION` | `reverb` | Broadcast driver |
| `REVERB_APP_ID` | `analyse-app` | Laravel Reverb alkalmazás azonosító |
| `REVERB_APP_KEY` | _(generált)_ | Laravel Reverb kulcs |
| `REVERB_APP_SECRET` | _(generált)_ | Laravel Reverb titkos kulcs |
| `REVERB_HOST` | `localhost` | Reverb belső hosztneve |
| `REVERB_PORT` | `8080` | Reverb szerver portja |
| `REVERB_SCHEME` | `http` | Reverb belső kommunikációja HTTP (SSL terminálás Nginxnél van) |
| `VITE_REVERB_APP_KEY` | `${REVERB_APP_KEY}` | Echo kliens kulcs (Vite build) |
| `VITE_REVERB_HOST` | `analyse.example.com` | Echo kliens nyilvános hoszt |
| `VITE_REVERB_PORT` | `443` | Echo kliens port (Nginx-en át) |
| `VITE_REVERB_SCHEME` | `https` | Echo kliens scheme |

### 4. MySQL adatbázis előkészítése és inicializálása

```sql
-- MySQL shellben (root felhasználóként):
CREATE DATABASE analyse_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'analyse_user'@'localhost' IDENTIFIED BY 'erős_jelszó';
GRANT ALL PRIVILEGES ON analyse_production.* TO 'analyse_user'@'localhost';
FLUSH PRIVILEGES;
```

```bash
# Laravel migrációk futtatása (táblák létrehozása)
php artisan migrate --force

# Alap adatok betöltése (szerepkörök, beállítások)
php artisan db:seed --force
```

> **Információ:** 
  A migrációs fájlok a `database/migrations/` mappában találhatók. Az `artisan migrate` csak a még le nem futott migrációkat alkalmazza — frissítéskor is biztonságos.

### 5. Laravel inicializálása

```bash
# App key generálása (ha még nincs .env-ben)
php artisan key:generate

# Filament admin panel frissítése
php artisan filament:upgrade

# Storage symlink létrehozása (public/storage → storage/app/public)
php artisan storage:link

# Jogosultságok beállítása
chmod -R 775 storage bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Config és route cache (production optimalizáció)
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
```

### 6. Nginx konfigurálása

Az alkalmazás **Laravel Octane (Swoole)** alapon fut — a Nginx nem PHP-FPM-re, hanem az Octane HTTP szerverre proxyzza a kéréseket. A **Reverb WebSocket szerver** szintén Nginx-en keresztül érhető el WSS protokollon.

Hozz létre egy új Nginx virtual host konfigurációt (`/etc/nginx/sites-available/analyse`):

```nginx
server {
    listen 80;
    server_name analyse.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name analyse.example.com;

    ssl_certificate /etc/letsencrypt/live/analyse.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analyse.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /opt/analyse/public;
    index index.php;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # Statikus Vite build assetekhez — közvetlen kiszolgálás
    location /build {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Laravel Reverb WebSocket szerver (WSS)
    location /app {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    # Laravel Reverb Pusher API végpont
    location /apps {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Laravel Octane (Swoole HTTP szerver)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/analyse /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

> **Információ:** 
  Laravel Octane Swoole alapon fut — **nem szükséges** PHP-FPM konfiguráció az alkalmazásforgalomhoz. A PHP-FPM eltávolítható vagy más célra használható. Az Octane szervere a `8000`-es porton hallgat, a Reverb a `8080`-ason.

### 7. Supervisor konfigurálása (Octane \+ Queue worker \+ Reverb)

Hozz létre három Supervisor konfigurációs fájlt:

**Laravel Octane alkalmazásszerver** (`/etc/supervisor/conf.d/analyse-octane.conf`):

```ini
[program:analyse-octane]
command=php /opt/analyse/artisan octane:start --server=swoole --host=127.0.0.1 --port=8000 --workers=4
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
redirect_stderr=true
stdout_logfile=/opt/analyse/storage/logs/octane.log
stopwaitsecs=30
```

> **Információ:** 
  A `--workers` értéket a szerver vCPU számához igazítsd (általában: vCPU × 2). Az Octane persistent worker-eket tart fenn — `.env` változó módosítása után `supervisorctl restart analyse-octane` szükséges.

**Queue worker** (`/etc/supervisor/conf.d/analyse-worker.conf`):

```ini
[program:analyse-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /opt/analyse/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/opt/analyse/storage/logs/worker.log
stopwaitsecs=3600
```

**Laravel Reverb WebSocket szerver** (`/etc/supervisor/conf.d/analyse-reverb.conf`):

```ini
[program:analyse-reverb]
command=php /opt/analyse/artisan reverb:start --host=127.0.0.1 --port=8080
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
redirect_stderr=true
stdout_logfile=/opt/analyse/storage/logs/reverb.log
stopwaitsecs=10
```

> **Információ:** 
  A Reverb a `127.0.0.1:8080`-on hallgat — az internet felé közvetlenül nem érhető el, csak Nginx WSS proxyn keresztül. Az `/app` és `/apps` Nginx location blokkok irányítják rá a WebSocket forgalmat.

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start analyse-octane
sudo supervisorctl start "analyse-worker:*"
sudo supervisorctl start analyse-reverb
```

### 8. Első rendszergazda fiók létrehozása

Az adminisztrátori fiók létrehozásához a Filament beépített parancsát használd:

```bash
php artisan make:filament-user
```

A parancs interaktívan kéri a nevet, e-mail-címet és jelszót.

## Telepítés ellenőrzése

A telepítés sikerességének ellenőrzéséhez:

1. Nyisd meg a böngészőben az `https://analyse.example.com/admin` URL-t
2. Jelentkezz be az adminisztrátori fiókkal
3. Ellenőrizd, hogy az irányítópult betöltődik
4. Hozz létre egy tesztprojektet az alapvető funkciók ellenőrzéséhez

> **Ellenőrzés:** 
  Ha a bejelentkezési oldal megjelenik és az adminisztrátori fiókkal be tudsz lépni, a telepítés sikeres.

## Frissítés

Meglévő telepítés frissítésekor:

```bash
# 1. Maintenance mode bekapcsolása
php artisan down

# 2. Húzd le a legújabb verziót
git pull origin main

# 3. PHP függőségek frissítése
composer install --no-dev --optimize-autoloader

# 4. Frontend build frissítése
npm install
npm run build

# 5. Adatbázis-migrációk futtatása
php artisan migrate --force

# 6. Cache törlése és újraépítése
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 7. Octane újraindítása (persistent worker-ek frissítéséhez kötelező)
sudo supervisorctl restart analyse-octane

# 8. Queue worker újraindítása
php artisan queue:restart
sudo supervisorctl restart "analyse-worker:*"

# 9. Reverb újraindítása (ha broadcast config változott)
sudo supervisorctl restart analyse-reverb

# 10. Maintenance mode kikapcsolása
php artisan up
```

> **Figyelmeztetés:** 
  Frissítés előtt mindig készíts biztonsági mentést az adatbázisról és a konfigurációs fájlokról.

## Hibaelhárítás

| Tünet | Lehetséges ok | Megoldás |
| --- | --- | --- |
| Az alkalmazás nem töltődik be | Hibás `.env` konfiguráció vagy hiányzó `APP_KEY` | Ellenőrizd: `php artisan config:show`, naplók: `storage/logs/laravel.log` |
| 500 Internal Server Error | `storage/` vagy `bootstrap/cache/` nem írható | `chmod -R 775 storage bootstrap/cache` |
| Adatbázis-kapcsolódási hiba | Helytelen `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` | `mysql -u analyse_user -p analyse_production` — ellenőrizd a kapcsolatot |
| Queue job-ok nem futnak | Supervisor leállt, queue worker nem fut | `sudo supervisorctl status`, `php artisan queue:work` manuálisan tesztelve |
| E-mailek nem érkeznek meg | Hibás `MAIL_*` beállítások | `php artisan tinker` → `Mail::raw('teszt', fn($m) => $m->to('te@pelda.hu'))` |
| 502 Bad Gateway | Octane szerver nem fut | `sudo supervisorctl status analyse-octane`, majd `sudo supervisorctl restart analyse-octane` |
| WebSocket nem csatlakozik | Reverb nem fut vagy Nginx WSS proxy hibás | `sudo supervisorctl status analyse-reverb`; ellenőrizd a Nginx `/app` location blokkot |
| WebSocket 403 / auth hiba | Helytelen `REVERB_APP_KEY` vagy `VITE_REVERB_*` változók | Győződj meg, hogy `BROADCAST_CONNECTION=reverb` és a `VITE_*` változók egyeznek; futtasd `npm run build` újra |
| Octane `.env` változó nem érvényesül | Octane cachelő persistent workereket használ | Futtasd: `php artisan octane:reload` vagy `sudo supervisorctl restart analyse-octane` |
| Livewire nem reagál | Hiányzó CSRF token vagy session hiba | Ellenőrizd a `SESSION_DRIVER=redis` beállítást és a Redis elérhetőségét |
