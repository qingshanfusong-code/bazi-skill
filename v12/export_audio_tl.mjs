// writes out/audio_tl.json (rpm/throttle/crank angle at 1 kHz + events) for audio/make_audio.py
import fs from 'fs';
import * as TL from './src/timeline.js';
const o = { rpm: [], thr: [], theta: [], flames: TL.FLAMES, cuts: TL.CUTS };
for (let i = 0; i <= TL.DURATION * 1000; i++) { const t = i / 1000; o.rpm.push(Math.round(TL.rpmAt(t))); o.thr.push(+TL.throttleAt(t).toFixed(3)); o.theta.push(+TL.thetaAt(t).toFixed(3)); }
fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/audio_tl.json', JSON.stringify(o)); console.log('ok');
