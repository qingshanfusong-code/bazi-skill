#!/bin/bash
# usage: st.sh outdir t...
cd "$(dirname "$0")"
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe xvfb-run -a -s "-screen 0 1920x1080x24 +extension GLX" node stills.mjs "$@" 2>&1 | grep -v toNonIndexed
