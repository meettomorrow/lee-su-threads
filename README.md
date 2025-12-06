# Lee-Su-Threads 你是誰

一個 Chrome 擴充功能，自動顯示 Threads 貼文作者的地點資訊，不需要點進每個人的個人檔案。

> **[English](#english)** below

## 功能

- **自動擷取**：瀏覽動態時自動載入作者的地點資訊
- **地點標籤**：在貼文時間旁顯示作者所在地點
- **快取機制**：已擷取的資料會快取 72 小時
- **匯出資料**：可將所有資料匯出為 JSON
- **速率限制保護**：被 Threads 限制時會自動暫停並提醒

## 擷取的資訊

- **地點**：作者設定的所在地（例如：台灣）
- **加入時間**：加入 Threads 的時間

## 截圖

![動態中的地點標籤](screenshots/feed-badge.png)

![擴充功能彈出視窗](screenshots/popup.png)

## 安裝方式

**推薦：** 前往 [Chrome Web Store](https://chromewebstore.google.com/detail/lee-su-threads/cciaoflecmmomchcjndagcnfpdaanhol)，點擊「**加到 Chrome**」按鈕即可安裝，日後可自動獲得更新。

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
4. 開啟 Chrome，前往 `chrome://extensions/`
5. 開啟右上角的「**開發人員模式**」
6. 點擊「**載入未封裝項目**」
7. 選擇專案中的 `dist/` 資料夾

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

A Chrome extension that automatically displays location info for Threads post authors without visiting each profile.

### Features

- **Auto-fetch**: Automatically loads author location while browsing the feed
- **Location badges**: Shows location next to post timestamp
- **Caching**: Extracted data is cached for 72 hours
- **Export**: Export all data as JSON
- **Rate limit protection**: Auto-pauses and notifies when rate limited by Threads

### Installation

**Recommended:** Go to [Chrome Web Store](https://chromewebstore.google.com/detail/lee-su-threads/cciaoflecmmomchcjndagcnfpdaanhol) and click "**Add to Chrome**" for easy installation and automatic updates.

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
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable **Developer mode** (toggle in top-right corner)
6. Click **Load unpacked**
7. Select the `dist/` folder from the project

</details>

### Usage

1. Navigate to [threads.com](https://www.threads.com)
2. Browse your feed normally
3. Location badges will automatically appear next to posts
4. Click the extension icon to view all extracted profiles

### Privacy

- All data is stored locally in Chrome's storage
- No data is sent to external servers
- Cache is automatically cleared after 72 hours

## License

MIT License
