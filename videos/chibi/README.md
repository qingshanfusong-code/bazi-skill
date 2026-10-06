# 赤壁之战 · 程序化动画短片（抖音竖屏）

参考「AI 历史大片」风格：暗夜江面、冷青暗部与火光暖调、中英双语字幕、黑场年份字卡、书法标题逐字点亮。
全片画面由 Canvas 代码逐帧绘制，配乐与音效由 numpy 合成，没有使用任何外部素材。

- 规格：1080×1920 竖屏，30fps，48 秒，H.264 + AAC
- 成片：`chibi.mp4`

## 分镜

| 时间 | 镜头 | 字幕 |
| --- | --- | --- |
| 0–3.6s | 黑场字卡 | 「建安十三年 · 冬」 |
| 3.6–9.6s | 月下曹营，楼船铁索连江 | 曹操八十万大军 陈兵长江 / 战船首尾相连 铁索横江 |
| 9.6–14.2s | 「曹」字大纛，东南风骤起 | 这一夜 风向变了 / 东南风起 |
| 14.2–19.6s | 黄盖火船借风冲向曹营 | 黄盖诈降 火船借风而来 / 船载柴草 灌以膏油 |
| 19.6–23.2s | 弓手剪影，引火箭满弓 | 周郎一声令下 / 放箭！ |
| 23.2–27.4s | 万箭齐发，火雨落向连营 | — |
| 27.4–35.4s | 火烧连营，主桅倾倒 | 风盛火猛 烟炎张天 / 铁索连舟 一船起火 百船难逃 |
| 35.4–40.2s | 水下，沉船与火光 | 后来的人都说 / 这一把火 烧出了三分天下 |
| 40.2–48s | 书法「赤壁」+ 苏轼词句逐字点亮 | 大江东去 浪淘尽 千古风流人物 |

## 重新生成

依赖：Node + Playwright（Chromium）、Python 3 + numpy、ffmpeg。

```bash
./fetch_fonts.sh                                              # 下载字体（马善政 / 思源宋体 / 思源黑体）
NODE_PATH=$(npm root -g) node render.js preview prev 7 31     # 指定秒数出 PNG 预览
NODE_PATH=$(npm root -g) node render.js video silent.mp4 4    # 4 进程并行渲染无声成片
python3 audio.py chibi.wav                                    # 合成配乐与音效
ffmpeg -i silent.mp4 -i chibi.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart chibi.mp4
```

字幕、时间轴在 `scene.js` 的 `SUBS` / `SC` 里修改；音效时间点在 `audio.py` 中与之对应。
