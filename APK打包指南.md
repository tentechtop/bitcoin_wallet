# React Native 打包 APK 指南

本指南介绍如何将 React Native/Expo 项目打包成 Android APK 文件。

---

## 目录

1. [打包前准备](#一打包前准备)
2. [配置项目](#二配置项目)
3. [配置签名证书](#三配置签名证书)
4. [构建 APK](#四构建-apk)
5. [测试和发布](#五测试和发布)
6. [常见问题](#六常见问题)

---

## 一、打包前准备

### 1.1 环境要求

确保已安装以下工具：

```bash
# 检查 Node.js 版本（建议 18+）
node --version

# 检查 Expo CLI
npx expo --version

# 检查 Java JDK（建议 JDK 17）
java -version

# 检查 Android SDK
adb version
```

**未安装 Android SDK？**
1. 下载 Android Studio: https://developer.android.com/studio
2. 安装后打开 SDK Manager
3. 安装 Android SDK Platform-Tools 和 Build-Tools
4. 配置环境变量：
   - `ANDROID_HOME` → Android SDK 路径
   - 将 `%ANDROID_HOME%\platform-tools` 添加到 PATH

---

### 1.2 项目配置

**当前项目信息：**
- 项目路径：`D:/workSpace2026/blockchain/bitcoin-wallet`
- 证书位置：`D:/keys/tentech.keystore`
- 证书别名：`testalias`
- 证书密码：`tentech`

---

## 二、配置项目

### 2.1 安装 EAS CLI

Expo Application Services (EAS) 是推荐的打包方式。

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账户
eas login

# 初始化 EAS 配置
eas build:configure
```

---

### 2.2 配置 app.json

编辑项目根目录的 `app.json` 文件，添加 Android 配置：

```json
{
  "expo": {
    "name": "bitcoin-wallet",
    "slug": "bitcoin-wallet",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.bitcoinwallet.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.bitcoinwallet.app",
      "permissions": [
        "INTERNET",
        "ACCESS_NETWORK_STATE"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

**重要配置说明：**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `name` | 应用名称 | `bitcoin-wallet` |
| `slug` | 应用标识（用于 URL） | `bitcoin-wallet` |
| `version` | 版本号 | `1.0.0` |
| `package` | Android 包名 | `com.bitcoinwallet.app` |
| `bundleIdentifier` | iOS Bundle ID | `com.bitcoinwallet.app` |

---

### 2.3 创建 eas.json 配置

在项目根目录创建 `eas.json` 文件：

```json
{
  "cli": {
    "version": ">= 7.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

**配置说明：**
- `development`: 开发版本，使用开发客户端
- `preview`: 预览版本，内部分发
- `production`: 生产版本，正式发布
- `buildType: "apk"`: 生成 APK 文件（AAB 用于 Google Play）

---

## 三、配置签名证书

### 3.1 验证证书文件

确保证书文件存在于指定位置：

```bash
# 验证证书文件
ls D:/keys/tentech.keystore

# 查看证书信息
keytool -list -v -keystore D:/keys/tentech.keystore -alias testalias
# 输入密码：tentech
```

**预期输出：**
```
Alias name: testalias
Creation date: ...
Entry type: PrivateKeyEntry
Certificate chain length: 1
```

---

### 3.2 在 EAS 中配置签名

**方式一：使用 EAS 管理证书（推荐）**

```bash
# 将本地证书上传到 EAS
eas credentials

# 选择：Android
# 选择：Keystore
# 输入证书信息：
# - Keystore: D:/keys/tentech.keystore
# - Keystore password: tentech
# - Key alias: testalias
# - Key password: tentech
```

**方式二：本地构建（使用本地证书）**

创建 `android/keystore.properties` 文件：

```properties
KEYSTORE_FILE=D:/keys/tentech.keystore
KEYSTORE_PASSWORD=tentech
KEY_ALIAS=testalias
KEY_PASSWORD=tentech
```

修改 `android/app/build.gradle`：

```gradle
android {
    ...

    // 读取签名配置
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

    signingConfigs {
        release {
            if (keystoreProperties['KEYSTORE_FILE']) {
                storeFile file(keystoreProperties['KEYSTORE_FILE'])
                storePassword keystoreProperties['KEYSTORE_PASSWORD']
                keyAlias keystoreProperties['KEY_ALIAS']
                keyPassword keystoreProperties['KEY_PASSWORD']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}
```

---

## 四、构建 APK

### 4.1 使用 EAS 云构建（推荐）

**优势：**
- 无需本地 Android 环境
- 构建速度快
- 自动处理签名
- 多架构支持

**步骤：**

```bash
# 1. 进入项目目录
cd D:/workSpace2026/blockchain/bitcoin-wallet

# 2. 构建预览版 APK
eas build --platform android --profile preview

# 3. 构建正式版 APK
eas build --platform android --profile production
```

**构建过程：**
1. 上传代码到 EAS 服务器
2. EAS 在云端构建应用
3. 生成 APK 文件
4. 下载链接会显示在终端

**下载 APK：**
构建完成后，终端会显示下载链接：
```
📦 Build finished
🔗 https://expo.dev/artifacts/...
```

点击链接下载 APK 文件。

---

### 4.2 本地构建（需要 Android SDK）

**步骤 1：预构建 Android 项目**

```bash
# 生成 Android 项目
npx expo prebuild --platform android

# 这会生成 android/ 目录
```

**步骤 2：进入 Android 项目**

```bash
cd android
```

**步骤 3：构建 APK**

```bash
# Windows 系统
gradlew.bat assembleRelease

# Mac/Linux 系统
./gradlew assembleRelease
```

**构建产物位置：**
```
android/app/build/outputs/apk/release/app-release.apk
```

---

### 4.3 使用 Expo Application Services (经典方式)

```bash
# 安装旧版 CLI
npm install -g expo-cli

# 构建独立 APK
expo build:android --type apk

# 选择签名方式：
# 1. Generate new keystore（生成新证书）
# 2. Use an existing keystore（使用现有证书）
#    - 选择现有证书
#    - 输入证书路径：D:/keys/tentech.keystore
#    - 输入密码：tentech
```

---

## 五、测试和发布

### 5.1 安装 APK 到设备

**通过 USB 安装：**

```bash
# 连接设备并启用 USB 调试
adb devices

# 安装 APK
adb install app-release.apk

# 安装并替换已有应用
adb install -r app-release.apk
```

**通过命令安装：**

```bash
# 直接安装
adb install android/app/build/outputs/apk/release/app-release.apk
```

---

### 5.2 生成安装二维码

```bash
# 使用 eas 构建，生成下载链接后，转换二维码
# 可使用在线工具：https://www.qr-code-generator.com/
```

---

### 5.3 发布到 Google Play

**构建 AAB 格式（Google Play 要求）：**

修改 `eas.json`：

```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"  // 改为 app-bundle
      }
    }
  }
}
```

```bash
# 构建 AAB
eas build --platform android --profile production

# 或本地构建
./gradlew bundleRelease
```

**产物位置：**
```
android/app/build/outputs/bundle/release/app-release.aab
```

**上传到 Google Play：**
1. 登录 Google Play Console
2. 创建新应用
3. 上传 AAB 文件
4. 填写应用信息
5. 提交审核

---

## 六、常见问题

### Q1：构建失败，提示 "Keystore not found"

**解决方案：**
1. 确认证书路径正确：`D:/keys/tentech.keystore`
2. 检查文件是否存在：
   ```bash
   dir D:/keys/tentech.keystore
   ```
3. 确认路径使用正斜杠 `/` 而非反斜杠 `\`

---

### Q2：证书密码错误

**解决方案：**
1. 确认密码为 `tentech`
2. 测试证书：
   ```bash
   keytool -list -keystore D:/keys/tentech.keystore -alias testalias
   ```
3. 忘记密码需要重新生成证书

---

### Q3：构建速度慢

**解决方案：**
1. 使用 EAS 云构建（推荐）
2. 增加本地构建内存：
   ```bash
   # 编辑 android/gradle.properties
   org.gradle.jvmargs=-Xmx4096m
   ```
3. 使用增量构建：
   ```bash
   gradlew assembleRelease --parallel
   ```

---

### Q4：APK 安装失败

**可能原因：**
1. 签名不匹配：卸载旧版本后重新安装
2. SDK 版本不兼容：降低 `minSdkVersion`
3. 签名配置错误：检查 `keystore.properties`

---

### Q5：如何生成新证书？

```bash
# 生成新证书
keytool -genkey -v -keystore D:/keys/tentech.keystore -alias testalias -keyalg RSA -keysize 2048 -validity 10000

# 按提示输入：
# - Keystore password: tentech
# - Key password: tentech
# - 其他信息（姓名、组织等）
```

---

### Q6：如何查看 APK 信息？

```bash
# 查看 APK 签名信息
keytool -printcert -jarfile app-release.apk

# 查看 APK 包名
aapt dump badging app-release.apk | findstr package

# 解压 APK
unzip app-release.apk -d apk-extracted
```

---

## 七、高级配置

### 7.1 配置应用图标

```bash
# 安装图标生成工具
npm install -g sharp-cli

# 生成所有尺寸图标
sharp-cli input.png -o ./assets/icon.png
```

**所需尺寸：**
- `icon.png`: 1024x1024
- `adaptive-icon.png`: 1024x1024 (前景)
- `favicon.png`: 48x48

---

### 7.2 配置应用权限

在 `app.json` 中添加：

```json
{
  "expo": {
    "android": {
      "permissions": [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    }
  }
}
```

---

### 7.3 配置应用启动屏

```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    }
  }
}
```

**启动屏尺寸：**
- iOS: 1284x2778 (iPhone 13 Pro Max)
- Android: 1284x2778 (自适应)

---

### 7.4 配置应用名称（多语言）

```json
{
  "expo": {
    "android": {
      "softwareKeyboardLayoutMode": "pan"
    },
    "androidNavigationBar": {
      "visible": "sticky-immersive",
      "barStyle": "light-content"
    }
  }
}
```

---

## 八、快速参考

### 8.1 常用命令速查

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo
eas login

# 构建预览版 APK
eas build --platform android --profile preview

# 构建正式版 APK
eas build --platform android --profile production

# 查看构建历史
eas build:list

# 本地构建
npx expo prebuild --platform android
cd android
gradlew.bat assembleRelease

# 安装 APK
adb install app-release.apk

# 查看设备
adb devices

# 查看日志
adb logcat
```

---

### 8.2 配置文件位置

| 文件 | 路径 |
|------|------|
| 项目配置 | `app.json` |
| EAS 配置 | `eas.json` |
| 签名配置 | `android/keystore.properties` |
| Android 构建 | `android/app/build.gradle` |
| 签名证书 | `D:/keys/tentech.keystore` |

---

### 8.3 当前项目证书信息

| 配置项 | 值 |
|--------|-----|
| 证书路径 | `D:/keys/tentech.keystore` |
| 证书别名 | `testalias` |
| 证书密码 | `tentech` |
| 密钥密码 | `tentech` |

---

## 九、参考资源

- [Expo EAS 官方文档](https://docs.expo.dev/build/introduction/)
- [Expo 构建选项](https://docs.expo.dev/build-reference/variants/)
- [Android 应用签名](https://developer.android.com/studio/publish/app-signing)
- [React Native Android 打包](https://reactnative.dev/docs/signed-apk-android)

---

**打包成功！🎉**

如有问题，请参考常见问题部分或查阅官方文档。
