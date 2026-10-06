#!/usr/bin/env bash
# 下载渲染所需字体（Google Fonts，SIL OFL 许可）
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts
curl -sSfL -o fonts/MaShanZheng.ttf https://fonts.gstatic.com/s/mashanzheng/v18/NaPecZTRCLxvwo41b4gvzkXaRMQ.ttf
curl -sSfL -o fonts/NotoSerifSC.ttf https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RcrCWv.ttf
curl -sSfL -o fonts/NotoSansSC.ttf https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG-3FnYw.ttf
echo "fonts ready"
