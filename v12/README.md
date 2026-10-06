# 《极致的燃烧》— V12 发动机原理 3D 讲解短片

72 秒 · 1920×1080 · 60fps 横屏，面向抖音。画面与声音全部由代码程序化生成（无外部素材、无版权音乐）。

## 分镜

| 时间 | 段落 | 内容 |
|---|---|---|
| 0–2s | 钩子 | 气缸内慢放爆燃 + “1 分钟 54,000 次爆炸”计数 |
| 2–4s | 片名 | 点火启动轰油门，《极致的燃烧》故障风标题 |
| 4–12s | 外观 | 环绕展示：红色凸轮轴盖 / 碳纤维进气总管 / 排气头段，60° V 角标注 |
| 12–20s | 透视 | X 光透视：活塞、连杆、曲轴、凸轮轴、火花塞 |
| 20–44s | 四冲程 | 单缸剖面慢放 1/200：进气 → 压缩 → 做功(BOOM) → 排气，粒子显示气流 |
| 44–54s | 点火顺序 | 俯视 12 缸轮流点火（每拍一次，与音乐同步）+ 扭矩波动对比 |
| 54–66s | 拉满 | 9000 RPM，排气管烧红、尾管喷火、快切镜头，音乐 drop |
| 66–72s | 结尾 | 片名 + 评论区互动引导 |

## 结构

- `src/engine.js` — 程序化 60° V12（曲轴/连杆/活塞/DOHC 配气/缸体/进排气）及运动学
- `src/timeline.js` — 曲轴转角、转速、镜头、特效的全部时间轴（120 BPM，1 小节 = 2 秒）
- `src/ui.js` — HUD：字幕、转速表、四冲程标签、标注引线、大字卡
- `src/main.js` — Three.js 场景、灯光、后期（泛光/残影/色差/颗粒）、逐帧渲染接口
- `audio/make_audio.py` — 原创 Phonk 配乐 + 按转速曲线合成的 V12 声浪 + 音效
- `render.mjs` / `rr.sh` — 无头 Chromium（Mesa llvmpipe）逐帧读像素 → ffmpeg

## 生成

```bash
npm install
# 实时预览：npx http-server . 后打开 index.html?play=0
./rr.sh 0 2160 out/part1.mp4 8141 & ./rr.sh 2160 4320 out/part2.mp4 8142
node export_audio_tl.mjs
python3 audio/make_audio.py out/audio_tl.json out/soundtrack.wav
./finish.sh
```

## 成片下载

- `release/V12_极致的燃烧_预览_28MB.mp4` — 压缩预览版
- `release/V12_抖音上传版.mp4.part00/01` — 1080p60 高清上传版（约 175MB，因 GitHub 单文件 100MB 限制被切分）。合并：
  - macOS / Linux：`cat V12_抖音上传版.mp4.part* > V12_抖音上传版.mp4`
  - Windows：`copy /b V12_抖音上传版.mp4.part00+V12_抖音上传版.mp4.part01 V12_抖音上传版.mp4`
- `cover.jpg` — 抖音封面
