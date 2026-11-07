# 步步為營 · 迷宮對決

參考使用者提供的 [Facebook 遊戲影片](https://www.facebook.com/share/v/1ExydWuVpW/)，以標準 Quoridor 雙人規則製作的繁體中文網頁遊戲。保留 9×9 深色棋盤及藍、粉紅兩方。

## 使用

從 [Releases](https://github.com/gyuyu2002-Jeff/quoridor-web/releases/latest) 下載 `index.html`，直接以瀏覽器開啟即可遊玩，無須伺服器、安裝套件或網路連線。這是兩人共用一台裝置的版本。

若下載的是原始碼，請先依下方步驟執行 `npm run build`，再開啟產生的 `dist/index.html`。

- 藍方先手，每回合移動棋子或放一道牆。
- 點亮點移動；放牆時選橫／直方向，再點縫隙預覽，最後確認。
- 雙方各有 10 道牆，牆長兩格，不得重疊、交叉或封死任一方道路。
- 與對手相鄰且無牆時可直線跳過；後方被牆或邊界擋住時才可斜跳。
- 先到對面底線任一格獲勝。可悔一步、重新開始或查看完整規則。
- 支援鍵盤 Tab／Enter；放牆時方向鍵選位置、R 旋轉、Esc 清除預覽。

## 開發與驗證

使用 Node.js 22 以上，沒有外部依賴。

```text
npm test
npm run build
```

`src/game.js` 負責不可變遊戲狀態、移動與 BFS 通路檢查。`src/app.js` 負責介面與互動。建置只將 CSS 與 JavaScript 內嵌成單一 HTML；沒有追蹤、外部字型或圖片資源。

影片未逐項解說細節，牆壁數量與跳躍細則採標準雙人規則。重新整理頁面會重設棋局。
