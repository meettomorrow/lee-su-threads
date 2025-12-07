# Lee-Su-Threads 你是誰

一個瀏覽器擴充功能（支援 Chrome 與 Firefox），自動顯示 Threads 貼文作者的地點資訊，不需要點進每個人的個人檔案。

> **[English](#english)** below

## 功能

- **自動擷取**：瀏覽動態時自動載入作者的地點資訊
- **地點標籤**：在貼文時間旁顯示作者所在地點
- **新用戶標記**：自動標示加入 Threads 未滿 30 天的新用戶
- **快取機制**：個人資料快取 72 小時，用戶 ID 快取 30 天
- **匯出資料**：可將所有資料匯出為 JSON
- **速率限制保護**：被 Threads 限制時會自動暫停並提醒

## 擷取的資訊

- **地點**：作者設定的所在地（例如：台灣）
- **加入時間**：加入 Threads 的時間

## 截圖

### 動態中的地點標籤
![動態中的地點標籤](screenshots/feed-badge.png)

### 彈出視窗 - 個人資料列表
![個人資料列表](screenshots/popup-profiles.png)

### 彈出視窗 - 地點統計
![地點統計](screenshots/popup-location-stats.png)

## 安裝方式

**Chrome 使用者：** 前往 [Chrome Web Store](https://chromewebstore.google.com/detail/lee-su-threads/cciaoflecmmomchcjndagcnfpdaanhol)，點擊「**加到 Chrome**」按鈕即可安裝，日後可自動獲得更新。

**Firefox 使用者：** 前往 [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/lee-su-threads-%E4%BD%A0%E6%98%AF%E8%AA%B0/)，點擊「**加到 Firefox**」按鈕即可安裝。

<details>
<summary>手動安裝（開發者）</summary>

**從 Release 安裝：**

1. 前往 [Releases 頁面](https://github.com/meettomorrow/lee-su-threads/releases) 下載最新版本的 ZIP 檔
2. 解壓縮 ZIP 檔
3. 開啟 Chrome，前往 `chrome://extensions/`
4. 開啟右上角的「**開發人員模式**」
5. 點擊「**載入未封裝項目**」
6. 選擇解壓縮後的資料夾
7. 擴充功能圖示會出現在工具列

**從原始碼建置：**

1. Clone 此專案
2. 執行 `npm install`
3. 執行 `npm run build`
4. **Chrome**: 開啟 Chrome，前往 `chrome://extensions/`，開啟「**開發人員模式**」，點擊「**載入未封裝項目**」，選擇專案中的 `dist/chrome/` 資料夾
5. **Firefox**: 開啟 Firefox，前往 `about:debugging#/runtime/this-firefox`，點擊「**載入臨時附加元件**」，選擇 `dist/firefox/manifest.json` 檔案

</details>

## 使用方式

1. 前往 [threads.com](https://www.threads.com)
2. 正常瀏覽動態
3. 擴充功能會自動在貼文旁顯示地點標籤
4. 點擊擴充功能圖示可查看所有已擷取的資料

## 隱私說明

- 所有資料僅儲存在本機 Chrome 儲存空間
- 不會將任何資料傳送到外部伺服器
- 快取會在 72 小時後自動清除

## 限制

- 需要 Threads 載入個人資料 API 才能擷取（通常瀏覽動態時會自動載入）
- 若 Threads 更改 API 格式，可能需要更新擴充功能
- 部分使用者可能未設定地點資訊

---

<a name="english"></a>

## English

A browser extension (Chrome & Firefox) that automatically displays location info for Threads post authors without visiting each profile.

### Features

- **Auto-fetch**: Automatically loads author location while browsing the feed
- **Location badges**: Shows location next to post timestamp
- **New user flagging**: Automatically marks users who joined Threads within the last 30 days
- **Caching**: Profile data cached for 72 hours, user IDs cached for 30 days
- **Export**: Export all data as JSON
- **Rate limit protection**: Auto-pauses and notifies when rate limited by Threads

### What's Extracted

- **Location**: User's set location (e.g., Taiwan)
- **Join date**: When the user joined Threads

### Screenshots

#### Location badges in feed
![Location badges in feed](screenshots/feed-badge.png)

#### Popup - Profiles tab
![Profiles list](screenshots/popup-profiles.png)

#### Popup - Location Stats tab
![Location statistics](screenshots/popup-location-stats.png)

### Installation

**Chrome Users:** Go to [Chrome Web Store](https://chromewebstore.google.com/detail/lee-su-threads/cciaoflecmmomchcjndagcnfpdaanhol) and click "**Add to Chrome**" for easy installation and automatic updates.

**Firefox Users:** Go to [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/lee-su-threads-%E4%BD%A0%E6%98%AF%E8%AA%B0/) and click "**Add to Firefox**" to install.

<details>
<summary>Manual Installation (Developers)</summary>

**From Release:**

1. Download the latest ZIP from [Releases](https://github.com/meettomorrow/lee-su-threads/releases)
2. Unzip the file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **Developer mode** (toggle in top-right corner)
5. Click **Load unpacked**
6. Select the unzipped folder
7. The extension icon should appear in your toolbar

**Build from Source:**

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. **Chrome**: Open Chrome, navigate to `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, select the `dist/chrome/` folder
5. **Firefox**: Open Firefox, navigate to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, select the `dist/firefox/manifest.json` file

</details>

### Usage

1. Navigate to [threads.com](https://www.threads.com)
2. Browse your feed normally
3. Location badges will automatically appear next to posts
4. Click the extension icon to view all extracted profiles

### Privacy

- All data is stored locally in your browser's storage
- No data is sent to external servers
- Profile cache is automatically cleared after 72 hours

## License

MIT License
