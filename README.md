# DSH Computer Use · 電腦操作

左側欄加一個 **電腦** 頁。開住之後，Agent 可以自己睇窗、click、打字、按鍵、捲動；你隨時可以一撳熄。

Adds a **Computer** page to the DSH sidebar. While it is on, the agent observes windows and operates them through your local CUA driver — and you can switch it off at any time.

## 做啲咩

側欄 **電腦** 頁有開關、driver 狀態同最近操作紀錄。Agent 就用 `computer_use` 工具：

| 動作 | 做啲咩 |
|---|---|
| `status` | 睇開關同 driver 狀態 |
| `windows` | 列出頂層視窗（預設只列on-screen） |
| `observe` | 讀一個視窗：截圖、最多 80 個可點元素、可加 `query` 篩選 |
| `click` | 撳元素（`elementToken`）或者截圖座標（`x`、`y`） |
| `type` | 喺指定視窗打字（最多 2,000 字） |
| `key` | 撳一個鍵：字母、數字、Enter、Tab、Esc、方向鍵、F1–F12 |
| `scroll` | 捲動 1–20 格 |

- 每次操作都要指定 `pid` + `windowId`，一定係你揀嘅嗰個窗。
- `observe` 會俾 `elementToken`；優先用 token 定位，座標只係後備。
- 背景輸入優先；背景唔得先會要求前景（前景會短暫搶焦點，所以唔會亂估）。
- Plugin 自己開一個私有 pipe（`\\.\pipe\dsh-computer-use`），用 `--permission-mode standard`；唔會連其他人嘅 driver，亦唔會用 unrestricted mode。
- 打字內容唔會寫入頁面紀錄，只記長度；頁面保留最近 24 條操作、最多 8 張截圖預覽。
- 唔支援：剪貼簿、殺 process、全桌面輸入、密碼／付款／權限對話框。

## 要唔要裝埋

要。呢個 plugin 係 **Windows 限定**，並且需要 **Cua driver**（`cua-driver.exe`）：

```powershell
irm https://cua.ai/driver/install.ps1 | iex
```

裝完之後，plugin 會自動搵：

```text
%LOCALAPPDATA%\Programs\Cua\cua-driver\bin\cua-driver.exe
```

如果 driver 放喺第二度，設定環境變數 `CUA_DRIVER_BIN` 指向個 exe 就得。

> Repo 唔會收錄第三方 `cua-driver.exe`（28 MB、非本 plugin 著作）。請用上面嘅官方安裝器，咁樣亦方便日後更新。

## 安全

- 開關預設開；撳一下即可關。關咗之後，agent 嘅 `click`／`type`／`key`／`scroll` 會直接被拒絕，`observe` 都只會喺你開返之後先做。
- 只有 **電腦** 頁可以改開關同啟動 driver；agent 自己改唔到。
- 只操作你指定嘅一個視窗；冇全桌面輸入、冇剪貼簿、冇 process kill。
- 呢個 plugin 唔會讀你嘅密碼欄位，亦唔應該用嚟做付款或者權限對話框操作。

## 同系列 DSH 插件

| 插件 / Plugin | 功能 / What it does | 要唔要裝埋 / Also install | Repo |
|---|---|---|---|
| **Attention Center** | 側欄通知收件箱：任務完成、待核准、新問題會閃，系統允許時出桌面通知<br>Sidebar inbox with a flashing icon and optional desktop notifications | 唔使 / None | [dsh-attention-center](https://github.com/Kinfxhk/dsh-attention-center) |
| **Computer Use** | 側欄「電腦」頁：Agent 可以睇窗、click、打字、按鍵、捲動（隨時可以熄）<br>Computer page where the agent observes and operates windows | 要：Windows + Cua driver<br>Yes: Windows + Cua driver | [dsh-computer-use](https://github.com/Kinfxhk/dsh-computer-use) |
| **Model Senses** | `model_senses`：睇圖＋上網搜尋，跟住即時預設 API<br>Vision and web-search tools routed through the live default API | 唔使（用已連線 API）<br>None (uses configured APIs) | [dsh-model-senses](https://github.com/Kinfxhk/dsh-model-senses) |
| **Model Shelf** | 側欄模型架：按 API 篩選、收藏、一撳套用<br>Sidebar shelf to filter, bookmark, and apply models | 唔使 / None | [dsh-model-shelf](https://github.com/Kinfxhk/dsh-model-shelf) |
| **Perplexity Guard** | 修正 Perplexity 嘅 Opus／Sonnet 5.5、GPT-6.1 Sol 請求同 provider 設定<br>Fixes Perplexity requests and provider settings | 要：Perplexity API key<br>Yes: Perplexity API key | [dsh-perplexity-api-fix-plugin](https://github.com/Kinfxhk/dsh-perplexity-api-fix-plugin) |

## 安裝

需要 DSH `0.2.1-rc.5` 或以上。

1. 下載呢個 repo（`git clone`，或者 **Code → Download ZIP**）。
2. 喺 DSH 用 `plugin_manager` 安裝，`target` 填資料夾嘅絕對路徑：

   ```text
   plugin_manager(action: "install_bundle", target: "C:\\path\\to\\dsh-computer-use")
   ```

3. 重啟 DSH，左側欄會出現 **電腦**。
4. 如果未裝 Cua driver，先用上面嘅安裝指令裝好，再喺頁面撳 **啟動 driver**。

## English

A Windows-only DSH plugin that adds a **Computer** page. The agent gets a `computer_use` tool with `status`, `windows`, `observe`, `click`, `type`, `key`, and `scroll`. Every action targets one explicit window; `observe` returns a screenshot plus up to 80 element tokens, and background delivery is tried before foreground.

The plugin starts its own private `cua-driver` process on `\\.\pipe\dsh-computer-use` with `--permission-mode standard`. It never attaches to another agent's driver pipe and never selects unrestricted mode. The switch is on by default and can be turned off at any time; while off, input actions are refused.

Requires the official Cua driver (`irm https://cua.ai/driver/install.ps1 | iex`, installed at `%LOCALAPPDATA%\Programs\Cua\cua-driver\bin\cua-driver.exe`) or `CUA_DRIVER_BIN`. Not included here because it is a third-party 28 MB binary.

Not supported: clipboard, process kill, desktop-wide input, password/payment/permission dialogs.

Install: clone and run `plugin_manager` with `action: "install_bundle"` and the absolute folder path, then restart DSH.

## License

MIT
