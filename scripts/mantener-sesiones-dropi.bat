@echo off
cd /d C:\Users\herna\OneDrive\DOCUME~1\MOMBET~1
echo ==== %date% %time% ==== >> mantener-sesiones-dropi.log
call "C:\Program Files\nodejs\npx.cmd" tsx scripts/dropi-mantener-sesion.ts pa >> mantener-sesiones-dropi.log 2>&1
call "C:\Program Files\nodejs\npx.cmd" tsx scripts/dropi-mantener-sesion.ts pa dropshipper >> mantener-sesiones-dropi.log 2>&1
call "C:\Program Files\nodejs\npx.cmd" tsx scripts/dropi-mantener-sesion.ts cr >> mantener-sesiones-dropi.log 2>&1