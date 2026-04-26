# Tests

This file tracks manual regression and feature verification steps.

## Template

### Feature: <name>

#### Prerequisites
- <required setup>

#### Steps
1. <action>
2. <action>

#### Expected Results
- <result>

#### Rollback/Cleanup
- <cleanup action, if any>

### Feature: Web settings permission policy

#### Prerequisites
- App server is running from this repository.
- Settings panel can be opened from the sidebar.

#### Steps
1. Open Settings and locate `权限控制`.
2. Toggle `完全放行权限请求`.
3. Confirm `命令执行权限`、`文件变更权限`、`MCP 工具权限` become disabled while full allow is on.
4. Turn full allow off and cycle each permission row between `自动允许` and `每次询问`.
5. Restart the app server and reopen Settings.
6. Trigger a command approval or MCP tool permission request.

#### Expected Results
- Permission changes are saved to `~/.codex/web-bridge-settings.json`.
- Saved permission state survives restart.
- When a permission is set to `自动允许`, matching permission requests are approved without showing a pending card.
- When a permission is set to `每次询问`, matching requests show the normal confirmation card.
- Telegram settings and Telegram endpoints are no longer present.

#### Rollback/Cleanup
- Delete `~/.codex/web-bridge-settings.json` to restore defaults.

### Feature: Mobile dictation control

#### Prerequisites
- App is served from HTTPS or localhost.
- Browser microphone permission is available.

#### Steps
1. Open a thread on a mobile-sized viewport.
2. Confirm the microphone button is visible in the compact composer.
3. Tap or hold the microphone according to the dictation mode.
4. Speak a short sentence and stop recording.
5. Confirm the transcript appears in the composer or auto-sends according to Settings.

#### Expected Results
- Mobile compact layout no longer hides the microphone button.
- Insecure HTTP origins show a clear browser/security limitation instead of silently failing.
- Transcription accepts `text`、`transcript`、`data.text` 或 `data.transcript` response shapes.

#### Rollback/Cleanup
- Revoke browser microphone permission if needed.

### Feature: Skills dropdown closes after selection in composer

#### Prerequisites
- App is running from this repository.
- At least one thread exists and can be selected.
- At least one installed skill is available.

#### Steps
1. Open an existing thread so the message composer is enabled.
2. Click the `Skills` dropdown in the composer footer.
3. Click any skill option in the dropdown list.
4. Re-open the `Skills` dropdown and click the same skill again to unselect it.

#### Expected Results
- The skills dropdown closes immediately after each selection click.
- Selected skill appears as a chip above the composer input when checked.
- Skill chip is removed when the skill is unchecked on the next selection.

#### Rollback/Cleanup
- Remove the selected skill chip(s) before leaving the thread, if needed.

### Feature: Skills Hub manual search trigger

#### Prerequisites
- App is running from this repository.
- Open the `Skills Hub` view.

#### Steps
1. Type a unique query value in the Skills Hub search input (for example: `docker`), but do not press Enter or click Search yet.
2. Confirm the browse results do not refresh immediately while typing.
3. Click the `Search` button.
4. Change the query text to another value and press Enter in the input.
5. Clear the query, then click `Search` to reload the default browse list.

#### Expected Results
- Typing alone does not trigger remote Skills Hub search requests.
- Results refresh only after explicit submit via the `Search` button or Enter key.
- Empty-state text (if shown) references the last submitted query.
- Submitting an empty query returns the default skills listing.

#### Rollback/Cleanup
- Clear the search input and run a blank search to return to default listing.

### Feature: Dark theme for trending GitHub projects and local project dropdown

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Appearance is set to `Dark` in Settings.
- `GitHub trending projects` setting is enabled.

#### Steps
1. On the home/new-thread screen, inspect the `Choose folder` dropdown trigger.
2. Open the `Choose folder` dropdown and confirm menu/option contrast remains readable in dark mode.
3. Inspect the `Trending GitHub projects` section title, scope dropdown, and project cards.
4. Hover a trending project card and the scope dropdown trigger.
5. Toggle appearance back to `Light`, then return to `Dark`.

#### Expected Results
- Local project dropdown trigger/value uses dark theme colors with readable contrast.
- Trending section title, empty/loading text, scope dropdown, and cards use dark backgrounds/borders/text.
- Hover states in dark mode stay visible and do not switch to light backgrounds.
- Theme switch back/forth preserves correct styling for both controls.

#### Rollback/Cleanup
- Reset appearance to the previous user preference.

### Feature: Dark theme for worktree runtime selector and Skills Hub

#### Prerequisites
- App is running from this repository.
- Appearance is set to `Dark` in Settings.
- Skills Hub route is accessible.

#### Steps
1. Open the home/new-thread screen and inspect the `Local project / New worktree` runtime selector trigger.
2. Open the runtime selector and verify menu title, options, selected state, and checkmark visibility in dark mode.
3. Trigger a worktree action that shows worktree status and verify running/error status blocks remain readable in dark mode.
4. Open `Skills Hub` and verify header/subtitle, search bar, search/sort buttons, sync panel, badges, and status text.
5. Verify at least one skill card surface (title, owner, description, date, browse icon) in dark mode.
6. Open a skill detail modal and verify panel, title/owner, close button, README/body text, and footer actions in dark mode.

#### Expected Results
- Runtime dropdown trigger and menu use dark backgrounds, borders, and readable text/icons.
- Worktree status blocks use dark-friendly contrast for both running and error states.
- Skills Hub controls and sync panel are fully dark-themed with consistent hover/active states.
- Skill cards and the skill detail modal render with dark theme colors and accessible contrast.

#### Rollback/Cleanup
- Reset appearance to the previous user preference.

### Feature: Markdown file links with backticks and parentheses render correctly

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- Local file exists at `/root/New Project (1)/qwe.txt`.

#### Steps
1. Send a message containing: `Done. Created [`/root/New Project (1)/qwe.txt`](/root/New Project (1)/qwe.txt) with content:`.
2. In the rendered assistant message, click the `/root/New Project (1)/qwe.txt` link.
3. Right-click the same link and choose `Copy link` from the context menu.
4. Paste the copied link into a text field and inspect it.

#### Expected Results
- The markdown link renders as one clickable file link (not split into partial tokens).
- Clicking opens the local browse route for the full file path.
- Copied link includes the full encoded path and still resolves to the same file.

#### Rollback/Cleanup
- Delete `/root/New Project (1)/qwe.txt` if it was created only for this test.

### Feature: Runtime selector uses a toggle-style control

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.

#### Steps
1. On the home/new-thread screen, locate the runtime control below `Choose folder`.
2. Verify both options (`Local project` and `New worktree`) are visible at once without opening a menu.
3. Click `New worktree` and confirm it becomes the selected option style.
4. Click `Local project` and confirm selection returns.
5. Set Appearance to `Dark` in Settings and verify selected/unselected contrast remains readable.

#### Expected Results
- Runtime mode is presented as a two-option toggle (segmented control), not a dropdown menu.
- Clicking each option immediately switches the selected state.
- Selected option has a distinct active background/border in both light and dark themes.

#### Rollback/Cleanup
- Leave runtime mode and appearance at the previous user preference.

### Feature: Dark theme states for runtime mode toggle

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Locate the runtime mode toggle (`Local project` and `New worktree`) under `Choose folder`.
2. Hover each option and verify hover state is visible against dark backgrounds.
3. Select `New worktree`, then select `Local project` and compare active/inactive contrast.
4. Tab to the toggle options with keyboard navigation and verify the focus ring is visible.
5. Confirm icon color remains readable for selected and unselected options.

#### Expected Results
- Toggle container, options, and text/icons use dark-friendly colors.
- Hover and selected states are clearly distinguishable in dark mode.
- Keyboard focus ring is visible and does not blend into the background.

#### Rollback/Cleanup
- Return appearance and runtime selection to the previous user preference.

### Feature: pnpm dev script installs dependencies and starts Vite

#### Prerequisites
- `pnpm` is installed globally (`npm i -g pnpm` or via corepack).
- Repository is cloned and `node_modules/` does not exist (or may be stale).

#### Steps
1. Remove `node_modules/` if present: `rm -rf node_modules`.
2. Run `pnpm run dev`.
3. Wait for Vite dev server to start and display the local URL.
4. Open the displayed URL in a browser.

#### Expected Results
- `pnpm install` runs automatically before Vite starts (dependencies are installed).
- Vite dev server starts successfully and serves the app.
- No `npm` commands are invoked.

#### Rollback/Cleanup
- None.

### Feature: Stop button interrupts active turn without missing turnId

#### Prerequisites
- App is running from this repository.
- At least one thread can run a long response (for example, request a large code explanation).

#### Steps
1. Send a prompt that keeps the assistant generating for several seconds.
2. Immediately click the `Stop` button before the first assistant chunk fully completes.
3. Confirm generation halts.
4. Repeat with a resumed/existing in-progress thread (reload app while a turn is running, then click `Stop`).

#### Expected Results
- No error appears saying `turn/interrupt requires turnId`.
- Turn is interrupted successfully in both immediate-stop and resumed-thread scenarios.
- Thread state exits in-progress and the stop control returns to idle.

#### Rollback/Cleanup
- None.

### Feature: Revert PR #16 mobile viewport and chat scroll behavior changes

#### Prerequisites
- App is running from this repository.
- A thread exists with enough messages to scroll.
- Test on a mobile-sized viewport (for example 375x812).

#### Steps
1. Open an existing thread and scroll up to the middle of the chat history.
2. Wait for an assistant response to stream while staying at the same scroll position.
3. Send a follow-up message and observe chat positioning when completion finishes.
4. Open the composer on mobile and drag within the composer area.
5. Open/close the on-screen keyboard on mobile and verify the page layout remains usable.

#### Expected Results
- Chat behavior matches pre-PR #16 baseline (no PR #16 scroll-preservation logic active).
- No regressions from reverting PR #16 changes in conversation rendering and composer behavior.
- Mobile layout no longer includes PR #16 visual-viewport sync changes.

#### Rollback/Cleanup
- Re-apply PR #16 commits if the reverted behavior is not desired.

### Feature: Thread load capped to latest 10 turns

#### Prerequisites
- App is running from this repository.
- At least one thread exists with more than 10 turns/messages.

#### Steps
1. Open a long thread that previously caused UI lag during initial load.
2. While the thread is loading, immediately click another thread in the sidebar.
3. Return to the long thread.
4. Count visible loaded history blocks and confirm only the newest portion is shown.
5. Call `/codex-api/rpc` with method `thread/read` for the same thread and inspect `result.thread.turns.length`.
6. Call `/codex-api/rpc` with method `thread/resume` for the same thread and inspect `result.thread.turns.length`.

#### Expected Results
- Initial thread load renders only the most recent 10 turns.
- UI remains responsive during thread load.
- You can switch to another thread without the UI freezing.
- `thread/read` and `thread/resume` RPC responses contain at most 10 turns.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Empty thread first message materializes the thread route

#### Prerequisites
- App is running from this repository.
- Browser DevTools Console is available.
- A valid workspace path is available for `thread/start` (for example this repository root).

#### Steps
1. In the browser DevTools Console, run:
   ```js
   const created = await fetch('/codex-api/rpc', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       method: 'thread/start',
       params: { cwd: 'C:/Users/SW/Documents/Playground/codexui' },
     }),
   }).then((res) => res.json());
   window.__emptyThreadId = created.result?.thread?.id || '';
   window.__emptyThreadId;
   ```
2. Open `#/thread/<emptyThreadId>` with the returned id.
3. Confirm the page renders the empty-thread state: title/status show `空会话`, subtitle explains the thread has no messages yet, and the body shows `当前会话还没有消息。`
4. In the same empty thread, type a unique first prompt in the composer and submit it.
5. Confirm the UI stays on the same thread route instead of jumping back to `#/home`, and the empty-thread copy disappears.
6. Wait for the first turn to start rendering or for the in-progress state to appear.
7. Call `/codex-api/rpc` with method `thread/read` for the same thread id and inspect `result.thread.turns`.

#### Expected Results
- `thread/start` returns a thread id even before the first user message is sent.
- The empty-thread route is usable: composer accepts input and send works from that route directly.
- Submitting the first message materializes the thread without a permanent `is not materialized yet`, `before first user message`, or `rollout is empty` error surfacing to the user.
- The route remains on the same thread id and conversation content replaces the empty-thread state.
- `thread/read` returns at least one turn for the thread after the first message is sent.

#### Rollback/Cleanup
- Archive the temporary test thread from the UI, or call `/codex-api/rpc` with method `thread/archive` for the created thread id.

### Feature: Skills list request scoped to active thread cwd

#### Prerequisites
- App is running from this repository.
- Browser DevTools Network tab is open.
- At least two threads exist with different `cwd` values.

#### Steps
1. Reload the app and wait for initial data load.
2. In Network tab, inspect `/codex-api/rpc` requests with method `skills/list`.
3. Verify request params contain `cwds` with only the currently selected thread cwd.
4. Switch to another thread with a different cwd.
5. Inspect the next `skills/list` request and verify `cwds` now contains only the new selected thread cwd.

#### Expected Results
- `skills/list` no longer sends every thread cwd in one request.
- Each `skills/list` call includes at most one cwd for the active thread context.
- Skills list still updates when changing selected thread.

#### Rollback/Cleanup
- No cleanup required.

---

### Feature: GitHub Website Redesign — OpenClaw-Inspired Design + Web Demo Link

#### Prerequisites
- The `docs/index.html` file has been updated with the new design.
- A browser is available to view the page locally or via GitHub Pages.

#### Steps
1. Open `docs/index.html` in a browser (local file or via GitHub Pages).
2. Verify the fixed **navigation bar** at top with brand logo, section links, and "Get the App" CTA.
3. Verify the **announcement banner** below nav shows the XCodex WASM link.
4. Verify **hero section** displays lobster emoji, "AnyClaw" title with gradient, tagline, and four CTA buttons: "Try Web Demo", "Google Play", "Download APK", "GitHub".
5. Click **"Try Web Demo"** button — confirm it navigates to `https://xcodex.slrv.md/#/`.
6. Verify the **stats bar** shows key metrics (2 AI Agents, 1 APK, 0 Root Required, 73MB, infinity).
7. Scroll to **Live Demo** section — verify embedded iframe loads `https://xcodex.slrv.md/#/` with mock browser chrome.
8. Scroll to **Screenshots** section — verify four images render (2 desktop, 2 mobile).
9. Scroll to **Features** section — verify 6 feature cards in a 3-column grid.
10. Scroll to **Testimonials** section — verify two rows of auto-scrolling marquee cards (row 2 scrolls reverse). Hover to pause.
11. Scroll through **Architecture**, **Boot Sequence**, **Quick Start**, and **Tech Stack** sections — verify content renders.
12. Verify the **footer** includes a "Web Demo" link to `https://xcodex.slrv.md/#/`.
13. Test responsive at 768px and 480px — nav links collapse, grids single-column, buttons stack vertically.

#### Expected Results
- Page has a dark, premium feel with gradient accents, grain overlay, and smooth animations.
- All links to `https://xcodex.slrv.md/#/` work (announcement, hero CTA, demo section, quick start text, footer).
- Marquee testimonials scroll continuously and pause on hover.
- Embedded iframe demo loads successfully.
- Mobile responsive layout works at all breakpoints.

#### Rollback/Cleanup
- Revert `docs/index.html` to previous commit if needed.

---

### Feature: 会话切换轻量加载态与执行中输入区下拉可用

#### Prerequisites
- `7420` 服务正在运行，且前端资源已更新到本轮构建版本。
- 至少存在两个有消息历史的会话，方便来回切换观察。
- 当前线程可以进入执行中状态，或可手动触发一次长任务。

#### Steps
1. 打开 `7420` 页面并进入任意已有消息的会话。
2. 在左侧连续切换到另一个有历史消息的会话。
3. 观察切换过程中的会话区加载反馈。
4. 确认不会同时出现大骨架、切换遮罩和顶部同步条等多套加载动画。
5. 确认仅保留一个轻量顶部状态提示，旧内容会轻微淡出，而不是整块突然清空跳变。
6. 让当前线程进入执行中状态。
7. 在执行中点击输入框下方的 `模型`、`技能`、`思考强度` 三个控件。
8. 分别确认三个控件都可以正常打开并选择，不会因为执行中而被禁用。

#### Expected Results
- 会话切换时只出现一套低感知加载提示，不再叠加多个加载动画。
- 会话内容切换过程更平滑，旧内容短暂保留并淡出，新内容加载完成后自然替换。
- 执行任务过程中，`模型`、`技能`、`思考强度` 三个按钮仍可点击和打开。
- 修改这些控件不会打断当前正在执行的 turn，只影响后续发送或排队消息。

#### Rollback/Cleanup
- 无需额外清理；若需回退，恢复本轮前端构建前的 `ThreadComposer.vue`、`ThreadConversation.vue` 与 `App.vue` 版本。

---

### Feature: 会话滚动流畅度与全局壳层减重

#### Prerequisites
- `7420` 服务运行中，前端资源已更新到本轮构建版本。
- 准备一个长会话，至少包含 40 条以上消息，最好带命令卡片与图片消息。
- 同时准备桌面端和手机端各做一轮滚动体验验证。

#### Steps
1. 打开长会话，连续上下快速滚动消息列表。
2. 观察滚动过程中是否出现明显掉帧、白块、延迟跟手或 hover 控件抖动。
3. 在会话中切换到另一条有历史消息的线程，观察切换时顶部加载提示和内容过渡。
4. 打开侧栏，再关闭侧栏，检查遮罩、抽屉和主内容切换是否仍然平滑。
5. 在消息列表底部观察“回到底部”按钮、消息卡片、队列区、标题栏和输入区的视觉层级是否更轻。

#### Expected Results
- 长会话滚动时，页面跟手更稳定，不应再出现明显连续掉帧。
- 会话切换仅保留低感知过渡，不出现滤镜感或重阴影拖影。
- 标题栏、消息卡片、队列区和输入区整体更平、更轻，视觉层级更统一。
- 侧栏抽屉与主内容的切换应顺滑，不应因遮罩或重模糊造成明显性能负担。

#### Rollback/Cleanup
- 若需回退，恢复本轮前的 `ThreadConversation.vue`、`DesktopLayout.vue`、`ContentHeader.vue`、`ThreadComposer.vue`、`QueuedMessages.vue` 与 `App.vue` 版本。

---

### Feature: Android 恢复优先 runtime 状态同步

#### Prerequisites
- `7420` 服务运行中，前端资源已更新到本轮构建版本。
- Android CX Codex 或移动端 WebView 可以访问当前服务。
- 准备一个可运行长任务的会话，用于观察锁屏/切后台恢复。

#### Steps
1. 在 Android 端打开一个会话并发送一条会执行较久的任务。
2. 等待界面出现执行中状态后，锁屏 10-20 秒。
3. 解锁回到 CX Codex。
4. 观察页面是否先恢复“执行中/等待确认/已完成”等状态，而不是长时间卡在空白或旧状态。
5. 如果任务已完成，等待 2-3 秒，确认最终消息会自动补齐。
6. 再次切后台 10 秒后回到应用，重复观察一次。
7. 在桌面浏览器打开同一会话，确认 Web 端状态仍能正常跟随，不受 Android 恢复策略影响。

#### Expected Results
- Android 恢复后第一轮同步先走 runtime snapshot 和事件回放，不应立即触发明显卡顿的全量刷新。
- 任务执行中应显示执行态；任务完成后不应长期停留在“思考中”。
- 若有授权请求，应显示等待确认状态，并保留停止/发送队列逻辑。
- 第二轮补偿同步会按需刷新消息和线程列表，最终内容应自动补齐。
- `/codex-api/health` 中近期 `recentTimeouts` 不应因为恢复动作快速增加。

#### Rollback/Cleanup
- 无需清理。若需回退，恢复本轮 `src/composables/useDesktopState.ts`、`src/api/codexGateway.ts`、`src/App.vue` 和 `src/server/codexAppServerBridge.ts` 的改动。

---

### Feature: Android release 版本号与自动化回归

#### Prerequisites
- `7420` 服务运行中。
- 本机已安装 Android SDK、JDK，并存在 release 签名配置。
- 前端和 Android 资源已更新到当前版本。

#### Steps
1. 执行 `npm run test:7420 -- -ScreenshotDir output\regression-7420`。
2. 确认本机 `/health`、`/codex-api/health`、事件回放、公网 `/health` 均通过。
3. 确认桌面 `1440x900`、手机 `390x844`、折叠屏 `884x1104` 三个视口均无横向溢出和页面错误。
4. 执行 `npm run mobile:android:sync`。
5. 执行 `.\gradlew.bat assembleRelease`。
6. 检查 release APK 的 `versionName` 为当前 `package.json` 版本，`versionCode` 按 `major * 10000 + minor * 100 + patch` 递增。
7. 推送数字 tag 触发 GitHub Release 时，确认 `.github/workflows/release.yml` 未覆盖 `APP_VERSION_CODE`，Actions 构建也应使用同一套版本码规则。

#### Expected Results
- 自动化回归全部通过。
- Android Web 资源同步成功。
- release APK 构建成功。
- 本地和 GitHub Actions 产出的 `2.1.2` 都对应 `versionCode=20102`，可覆盖安装旧 `2.1.1` 构建。

#### Rollback/Cleanup
- 若需回退，恢复 `package.json`、`package-lock.json`、`android/app/build.gradle`、`.github/workflows/release.yml` 与 `docs/changelog.zh-CN.md`。

---

### Feature: 后台同步减少重型线程列表轮询

#### Prerequisites
- `7420` 服务运行中。
- 至少有一个已加载会话。
- 浏览器或 Android 壳能够连接通知流。

#### Steps
1. 打开任意会话并保持页面可见 2 分钟；可同时打开多个页面模拟旧客户端或多端访问。
2. 观察 `/codex-api/health` 的 `rpcDiagnostics.recentSlowRpc`。
3. 在会话执行中，确认前端仍能显示运行态、停止按钮和当前会话增量内容。
4. 锁屏或切后台后回到 Android 壳，确认 resume 首次恢复不会强制拉完整线程列表。
5. 手动点击刷新，确认仍会刷新线程列表和当前会话内容。
6. 观察任务完成、状态变化、通知流重连时，确认它们不会单独触发完整 `thread/list`，只有新建/归档/重命名等列表结构变化才触发。

#### Expected Results
- 后台心跳不再因为通知流陈旧或会话执行中而固定触发 `thread/list`。
- Android resume 主要走事件回放、runtime snapshot 和当前会话消息同步。
- 手动刷新、首次加载、通知明确指示列表变化时，线程列表仍会更新。
- RPC 队列中不应再持续出现每 30 秒左右一次的慢 `thread/list`。
- `turn/completed`、`thread/status/changed` 等运行态通知只刷新当前会话，不刷新完整列表。
- 多页面或旧客户端短时间重复请求相同 `thread/list` 时，后端应返回短缓存；新建/归档/重命名等结构变化会让缓存失效。

#### Rollback/Cleanup
- 若需回退，恢复 `src/composables/useDesktopState.ts` 中后台同步间隔和线程列表刷新判断。

---

### Feature: 7420 稳定性浸泡测试脚本

#### Prerequisites
- `7420` 服务运行中。
- 本机可访问 `http://127.0.0.1:7420/health` 与 `http://127.0.0.1:7420/codex-api/health`。
- 若不跳过公网检查，公网入口 `http://116.62.234.104:17420/health` 可访问。

#### Steps
1. 短时验证脚本：执行 `npm run test:7420:soak -- -DurationSeconds 90 -IntervalSeconds 15`。
2. 发布前浸泡：执行 `npm run test:7420:soak -- -DurationSeconds 7200 -IntervalSeconds 15`。
3. 如只验证本机稳定性，可追加 `-SkipPublic`。
4. 查看 `output\soak-7420\soak-*.json` 报告。

#### Expected Results
- 脚本在每个采样点输出本机、公网、API、pending/queued RPC、timeout 和慢 `thread/list` 信息。
- 没有连续健康检查失败。
- `queuedRpcCount` 与 `pendingRpcCount` 不超过阈值。
- 浸泡窗口内不出现新的 RPC timeout。
- 脚本退出码为 `0`，JSON 报告 `summary.passed=true`。

#### Rollback/Cleanup
- 若需回退，移除 `scripts/soak-7420.ps1`，并恢复 `package.json` 和本测试说明。
