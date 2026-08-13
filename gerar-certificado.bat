@echo off
REM ============================================================
REM  gerar-certificado.bat
REM  Cria certificado HTTPS para localhost e para o IP da rede.
REM  Rode na pasta do projeto, como ADMINISTRADOR.
REM ============================================================

if not exist "package.json" (
  echo [ERRO] Rode este script na pasta do projeto, junto do package.json.
  goto fim
)

net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Abra o CMD como Administrador.
  goto fim
)

echo.
echo Procurando o IP da rede local...
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
  if "%IP%"=="" set IP=%%a
)
set IP=%IP: =%

if "%IP%"=="" (
  echo [AVISO] IP nao encontrado. O certificado valera so para localhost.
) else (
  echo IP detectado: %IP%
)

where mkcert >nul 2>&1
if errorlevel 1 (
  echo.
  echo Instalando o mkcert...
  winget install -e --id FiloSottile.mkcert --accept-source-agreements --accept-package-agreements
  echo.
  echo Feche o CMD, abra de novo como Administrador e rode este script outra vez.
  goto fim
)

echo.
echo Instalando a autoridade certificadora local...
mkcert -install

if not exist "certificados" mkdir certificados
cd certificados

if "%IP%"=="" (
  mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
) else (
  mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1 %IP%
)

cd ..

echo.
echo ------------------------------------------------------------
echo Certificado criado em .\certificados
echo.
echo Desenvolver:  npm run dev:https
echo Balcao:       npm run build   e depois   npm run start:https
echo.
if not "%IP%"=="" echo De outro aparelho: https://%IP%:3000
echo ------------------------------------------------------------

:fim
pause