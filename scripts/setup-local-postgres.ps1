# One-shot local PostgreSQL setup for the Provia dev database.
#
# What it does:
#   1. Temporarily switches host auth (127.0.0.1) in pg_hba.conf to "trust".
#   2. Reloads postgres so the change takes effect.
#   3. Creates the `provia_admin` user and `provia` database (if missing).
#   4. Restores the original pg_hba.conf and reloads.
#
# Prerequisite: PostgreSQL 18 installed in the default Windows location.
# Run from an ELEVATED (Administrator) PowerShell prompt.

$ErrorActionPreference = "Stop"

$pgRoot = "C:\Program Files\PostgreSQL\18"
$dataDir = "$pgRoot\data"
$hba = "$dataDir\pg_hba.conf"
$psql = "$pgRoot\bin\psql.exe"
$pgCtl = "$pgRoot\bin\pg_ctl.exe"

if (-not (Test-Path $hba)) { throw "pg_hba.conf not found at $hba" }
if (-not (Test-Path $psql)) { throw "psql.exe not found at $psql" }

$backup = "$hba.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
Write-Host "[1/6] Backing up pg_hba.conf to: $backup"
Copy-Item $hba $backup

Write-Host "[2/6] Setting 127.0.0.1 host auth to trust (temporary)"
$content = Get-Content $hba -Raw
$patched = $content -replace 'host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256', 'host    all             all             127.0.0.1/32            trust'
Set-Content $hba $patched -NoNewline

Write-Host "[3/6] Reloading postgres"
& $pgCtl reload -D $dataDir | Out-Null

try {
    Write-Host "[4/6] Creating provia_admin user and provia database"
    $env:PGPASSWORD = ""
    $sqlCreateUser = @'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'provia_admin') THEN
        CREATE USER provia_admin WITH PASSWORD 'dev_password_change_me';
    ELSE
        ALTER USER provia_admin WITH PASSWORD 'dev_password_change_me';
    END IF;
END$$;
'@
    & $psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sqlCreateUser
    if ($LASTEXITCODE -ne 0) { throw "Failed to create/update provia_admin" }

    $dbExists = & $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'provia'"
    if ($dbExists -ne "1") {
        Write-Host "      Creating database 'provia'"
        & $psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE provia OWNER provia_admin;"
        if ($LASTEXITCODE -ne 0) { throw "Failed to create database" }
    } else {
        Write-Host "      Database 'provia' already exists"
    }

    & $psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE provia TO provia_admin;" | Out-Null
} finally {
    Write-Host "[5/6] Restoring original pg_hba.conf"
    Copy-Item $backup $hba -Force

    Write-Host "[6/6] Reloading postgres"
    & $pgCtl reload -D $dataDir | Out-Null
}

Write-Host ""
Write-Host "Done. You can now run: npm run db:push && npm run db:seed" -ForegroundColor Green
