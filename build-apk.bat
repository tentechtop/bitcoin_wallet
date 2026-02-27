@echo off
chcp 65001 >nul
echo ====================================
echo 开始构建APK
echo ====================================
echo.

cd /d f:\workSpace2026\blockchain\bitcoin-wallet\android

echo [1/3] 清理旧文件...
call gradlew.bat clean
echo.

echo [2/3] 开始构建Release APK...
call gradlew.bat assembleRelease
echo.

echo [3/3] 构建完成!
echo ====================================
echo APK文件位置:
echo android\app\build\outputs\apk\release\app-release.apk
echo ====================================

pause
