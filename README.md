# 喵记 · 安卓版（自己出 APK）

这是「喵记」的安卓包装版：整个 App 就是一个 WebView，加载打包在 `app/src/main/assets/www/` 里的离线网页。

**装好之后完全离线**：不需要网址、不需要服务器、不需要联网，打开就能记。

---

## 一、怎么得到 APK（不用装任何开发工具）

用 GitHub 的免费云端编译。全程在浏览器里点，大约 8 分钟。

### 1. 注册 / 登录 GitHub
打开 https://github.com （有账号直接登录）

### 2. 新建仓库
右上角 `+` → **New repository**
- Repository name 填 `miaojil`（随便起）
- 选 **Public**（Private 也能用 Actions，但免费额度少）
- 点 **Create repository**

### 3. 把整个工程传上去
进入刚建的仓库，点 **uploading an existing file**（或 `Add file → Upload files`），
然后把 `miaojil-android` 文件夹里的**所有东西**全选拖进去（包括 `.github`、`app`、`build.gradle` 等），
拖动完点 **Commit changes**。

> ⚠️ 一定要把 `app` 和 `.github` 这两个文件夹一起拖进去，少一个就编译不了。

### 4. 等它自动编译
点仓库顶部的 **Actions** 标签，会看到一个叫 `build-apk` 的任务在跑（约 3–6 分钟）。
第一次会让你点一下 **I understand my workflows, go ahead and enable them**。

### 5. 下载 APK
点进那次运行，拉到页面最底部 → **Artifacts** → 点 `miaojil-apk` 下载。
得到一个 zip，解压里面的 `app-debug.apk` 就是安装包。

### 6. 装到手机
把 `app-debug.apk` 传到手机（微信发给自己 / 数据线 / 网盘），用**卓易通**打开安装。
如果提示「未知来源」，允许一次即可。

---

## 二、编译失败了怎么办

最常见的两个原因：

1. **`.github` 文件夹没传上去** → Actions 标签里什么都没有。
   解决：仓库里 `Add file → Create new file`，文件名填
   `.github/workflows/build-apk.yml`，把本工程里那个文件的内容整段粘进去，提交即可。
2. **`app` 文件夹结构坏了**（比如传成了 `miaojil-android/app/app/...`）。
   正确结构见下面「项目结构」，`app/build.gradle` 必须在第一层。

在 Actions 里点开红色的那次运行，展开 `编译 APK` 那一步，把报错发我，我帮你改。

---

## 三、关于数据（重要）

- 数据存在 App 的私有目录里（WebView 的 localStorage），**只在这台手机上**
- **卸载 App 会全部丢失**；覆盖安装不会丢
- 所以：进「我的 → 数据 → 导出备份」，养成习惯更保险

### 以后重新编译要注意
GitHub 每次构建用的是**一次性签名密钥**，所以新构建的 APK 签名和旧的不同，
**不能直接覆盖安装**。正确做法：

1. 旧 App 里先「导出备份」
2. 卸载旧 App
3. 装新 APK
4. 打开 →「导入备份」

---

## 四、如果你想在电脑本地编译

装了 Android Studio（自带 JDK 和 SDK）的话：

```bash
cd miaojil-android
gradle :app:assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

或者用 Android Studio 打开这个文件夹，菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`。

---

## 五、项目结构

```
miaojil-android/
├── .github/workflows/build-apk.yml   云端编译脚本
├── build.gradle                      根构建脚本
├── settings.gradle
├── gradle.properties
└── app/
    ├── build.gradle                  App 模块配置
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/miaojil/app/MainActivity.java   ← 只有一个文件：WebView 壳
        ├── res/                      图标、主题、名字
        └── assets/www/               整个网页 App（index.html + assets/）
```

## 六、改界面改哪里

界面代码全在 `app/src/main/assets/www/` 里：

- `index.html` 入口
- `assets/app.css` 样式
- `assets/app.js` 逻辑（约 1300 行，无框架）

改完重新走一遍「上传 → 自动编译 → 下载 APK」就行。

## 七、为什么不用 file:// 直接加载网页

安卓 WebView 加载 `file://` 页面时，`localStorage` 是不可用的，数据一刷新就丢。
所以这里用 `WebViewAssetLoader` 把 assets 挂到 `https://appassets.androidplatform.net/`
这个虚拟域名下，页面就有了正常的 origin，数据能正常保存。这也是官方的推荐做法。
