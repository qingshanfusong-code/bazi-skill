"""Original soundtrack for 《极致的燃烧》: 120 BPM drift-phonk + synthesized V12 + SFX.
Everything is generated from scratch (no samples) and locked to src/timeline.js via out/audio_tl.json.
usage: python3 audio/make_audio.py out/audio_tl.json out/soundtrack.wav
"""
import json, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
tl = json.load(open(sys.argv[1]))
DUR = 72.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(12)
BPM = 120; BEAT = 60 / BPM; BAR = BEAT * 4; STEP = BEAT / 4

def at(x):  # sample index
    return int(round(x * SR))

def interp_tl(key):
    src = np.asarray(tl[key], dtype=np.float64)
    return np.interp(t, np.arange(len(src)) / 1000.0, src)

rpm = interp_tl('rpm'); thr = interp_tl('thr'); theta = interp_tl('theta')

def place(buf, x, start, gain=1.0):
    i = at(start)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    if i < 0:
        x = x[-i:]; i = 0
    buf[i:j] += x[:j - i] * gain

def env_exp(n, tau):
    return np.exp(-np.arange(n) / SR / tau)

def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos'); return signal.sosfilt(sos, x)
def lp(x, f, order=2):
    sos = signal.butter(order, f, btype='low', fs=SR, output='sos'); return signal.sosfilt(sos, x)
def hp(x, f, order=2):
    sos = signal.butter(order, f, btype='high', fs=SR, output='sos'); return signal.sosfilt(sos, x)

# ---------------------------------------------------------------- instruments
def kick(dur=0.45, f0=160, f1=42, punch=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-tt * 6.5)
    click = rng.standard_normal(n) * np.exp(-tt * 400) * 0.4 * punch
    return np.tanh((x + hp(click, 2000)) * 1.6) * 0.9

def bass808(freq, dur, glide_from=None, drive=2.2):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = np.full(n, float(freq))
    if glide_from:
        f = freq + (glide_from - freq) * np.exp(-tt * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.minimum(1, tt / 0.004) * np.exp(-tt * 1.4)
    rel = np.minimum(1, (dur - tt) / 0.03)
    return np.tanh(x * drive) * rel * 0.8

def snare(dur=0.32):
    n = int(dur * SR); tt = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1200, 9000) * np.exp(-tt * 16)
    body = np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 28) * 0.7
    clap = np.zeros(n)
    for d in (0, 0.009, 0.018):
        k = int(d * SR); clap[k:] += bp(rng.standard_normal(n - k), 900, 4000) * np.exp(-np.arange(n - k) / SR * 45) * 0.6
    return np.tanh((noise + body + clap) * 1.3) * 0.75

def hat(dur=0.06, open_=False):
    n = int((0.28 if open_ else dur) * SR); tt = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 7000, 4) * np.exp(-tt * (12 if open_ else 70))
    return x * 0.35

def cowbell(freq, dur=0.22):
    n = int(dur * SR); tt = np.arange(n) / SR
    sq = lambda f: signal.square(2 * np.pi * f * tt) * 0.5 + 0.5 * np.sin(2 * np.pi * f * tt)
    x = sq(freq) + 0.75 * sq(freq * 1.4836)
    x = bp(x, freq * 0.8, freq * 4.5)
    e = np.exp(-tt * 13) * 0.75 + np.exp(-tt * 55) * 0.6
    return x * e * 0.33

def pad(freqs, dur, cutoff=900):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.12, 0.0, 0.11):
            x += signal.sawtooth(2 * np.pi * f * (1 + d / 100) * tt + rng.uniform(0, 6))
    x = lp(x, cutoff, 2) / (len(freqs) * 3)
    a = np.minimum(1, tt / 0.8) * np.minimum(1, (dur - tt) / 0.8)
    return x * a * 0.5

def riser(dur, f0=200, f1=2400):
    n = int(dur * SR); tt = np.arange(n) / SR; k = tt / dur
    noise = rng.standard_normal(n)
    # sweeping band
    out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):
        fc = f0 * (f1 / f0) ** (k[min(i, n - 1)])
        out[i:i + seg] = bp(noise[i:i + seg], max(40, fc * 0.6), min(20000, fc * 1.6), 1)
    tone_f = 110 * (8 ** k)
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * 0.25
    return (out * 0.9 + tone) * (k ** 2.2) * 0.7

def whoosh(dur=0.5):
    n = int(dur * SR); tt = np.arange(n) / SR; k = tt / dur
    x = rng.standard_normal(n); out = np.zeros(n); seg = 1024
    for i in range(0, n, seg):
        fc = 300 + 5000 * np.sin(np.pi * k[min(i, n - 1)]) ** 2
        out[i:i + seg] = bp(x[i:i + seg], fc * 0.5, min(20000, fc * 1.8), 1)
    return out * np.sin(np.pi * k) ** 2 * 0.55

def impact(size=1.0, dur=2.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = 30 + 70 * np.exp(-tt * 9)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.6)
    crack = lp(rng.standard_normal(n), 5000) * np.exp(-tt * 9)
    body = lp(rng.standard_normal(n), 400) * np.exp(-tt * 3) * 1.5
    return np.tanh((sub * 1.4 + crack * 0.6 + body) * 1.2) * size * 0.9

def blip(freq=2400, dur=0.06):
    n = int(dur * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * tt) * np.exp(-tt * 70) * 0.25

def pop(size=1.0):
    n = int(0.22 * SR); tt = np.arange(n) / SR
    x = bp(rng.standard_normal(n), 250, 3500) * np.exp(-tt * 30)
    th = np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 25)
    return np.tanh((x * 2.2 + th) * 1.5) * 0.55 * size

def reverb(x, secs=1.8, mix=0.25, damp=3000):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / secs))
    ir = lp(ir, damp); ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix

# ---------------------------------------------------------------- music
music = np.zeros(N); drums = np.zeros(N); bassb = np.zeros(N); bells = np.zeros(N); pads = np.zeros(N); fx = np.zeros(N)
NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)
F1, Db1, Eb1, Ab0 = NOTE(29), NOTE(25), NOTE(27), NOTE(20)
prog = [F1, F1, Db1, Eb1]
# cowbell pattern (16 steps per bar), midi notes, None = rest
F5, Eb5, C5, Ab4, Db5, G5, F4 = 77, 75, 72, 68, 73, 79, 65
bellA = [F5, None, F5, None, Eb5, None, C5, None, F5, None, Ab4, None, C5, Db5, C5, None]
bellB = [F5, None, F5, Ab4 + 12, None, G5, F5, None, Eb5, None, C5, None, Db5, None, C5, Ab4]

def bar_groove(b0, sec, kind):
    """kind: 'A' groove, 'drop', 'half', 'thin'"""
    s = b0
    for step in range(16):
        ts = s + step * STEP
        # kicks
        if kind in ('A', 'drop'):
            if step in (0, 6, 10) or (kind == 'drop' and step in (3, 14)):
                place(drums, kick(), ts, 1.0)
        elif kind == 'half' and step == 0:
            place(drums, kick(0.6, 120, 38), ts, 0.9)
        # snares on 2 & 4
        if kind in ('A', 'drop') and step in (4, 12):
            place(drums, snare(), ts, 0.85)
        # hats
        if kind in ('A', 'drop'):
            v = 0.55 + 0.45 * ((step % 2) == 0)
            if kind == 'drop' and step in (14, 15):
                for r in range(3): place(drums, hat(), ts + r * STEP / 3, 0.7)
            else:
                place(drums, hat(open_=(step == 10 and kind == 'drop')), ts, v)
        elif kind == 'half' and step % 4 == 2:
            place(drums, hat(), ts, 0.35)

def bass_bar(b0, root, kind):
    if kind == 'A':
        place(bassb, bass808(root, BEAT * 1.5, glide_from=root * 1.5), b0, 0.8)
        place(bassb, bass808(root, BEAT * 1.0), b0 + BEAT * 2.5, 0.7)
    elif kind == 'drop':
        place(bassb, bass808(root, BEAT * 1.4, glide_from=root * 2, drive=3.5), b0, 1.0)
        place(bassb, bass808(root * 2 if root < 40 else root, BEAT * 0.5, drive=3.5), b0 + BEAT * 1.5, 0.8)
        place(bassb, bass808(root, BEAT * 1.4, glide_from=root * 0.75, drive=3.5), b0 + BEAT * 2.5, 0.95)
    elif kind == 'half':
        place(bassb, bass808(root, BAR * 0.9, drive=1.6), b0, 0.6)

def bells_bar(b0, pat, gain=1.0, octave=0):
    for step, m in enumerate(pat):
        if m is None: continue
        place(bells, cowbell(NOTE(m + 12 * octave)), b0 + step * STEP, gain)

for bi in range(36):
    b0 = bi * BAR
    root = prog[bi % 4]
    if b0 < 4:
        continue
    if b0 < 20:          # 4..20  groove A (bells enter at 4, full at 8)
        bar_groove(b0, b0, 'A'); bass_bar(b0, root, 'A')
        bells_bar(b0, bellA if bi % 2 == 0 else bellB, 0.8 if b0 < 8 else 1.0)
    elif b0 < 44:        # 20..44 slow-mo section, filtered
        bar_groove(b0, b0, 'half'); bass_bar(b0, root, 'half')
        if bi % 2 == 0: bells_bar(b0, [F5, None, None, None, None, None, C5, None, None, None, Ab4, None, None, None, None, None], 0.45)
    elif b0 < 54:        # 44..54 groove returns (firing order)
        bar_groove(b0, b0, 'A'); bass_bar(b0, root, 'A')
        bells_bar(b0, bellB if bi % 2 else bellA, 0.9)
    elif b0 < 56:        # build — only riser
        pass
    elif b0 < 66:        # DROP
        bar_groove(b0, b0, 'drop'); bass_bar(b0, root, 'drop')
        bells_bar(b0, bellA if bi % 2 == 0 else bellB, 1.15)
        bells_bar(b0, bellA if bi % 2 == 0 else bellB, 0.35, octave=1)
    else:                # outro
        if b0 < 70: bells_bar(b0, [F5, None, None, None, Eb5, None, None, None, C5, None, None, None, None, None, None, None], 0.6)

# snare roll into 54 & 44
for k in range(16):
    place(drums, snare(0.15), 52 + k * STEP * 0.5 + 1.0, 0.25 + 0.6 * k / 16)
for k in range(8):
    place(drums, snare(0.15), 43 + k * STEP, 0.3 + 0.5 * k / 8)
# pads
padF = [NOTE(53), NOTE(56), NOTE(60)]; padDb = [NOTE(49), NOTE(53), NOTE(56)]
place(pads, pad(padF, 4.2, 600), 0.0, 0.7)
for b0 in range(20, 44, 4):
    place(pads, pad(padF if (b0 // 4) % 2 == 0 else padDb, 4.2, 700), b0, 0.8)
place(pads, pad(padF, 6.5, 900), 66, 0.9)

# filter the slow-mo section (20..44): low-pass drums+bass+bells with smooth crossfade
def section_lp(x, a, b, f):
    y = lp(x, f, 2); w = np.clip(np.minimum((t - a) / 0.6, (b - t) / 0.3), 0, 1)
    return x * (1 - w) + y * w
drums = section_lp(drums, 20, 44, 500); bells = section_lp(bells, 20, 44, 1400)

# ---------------------------------------------------------------- SFX
place(fx, impact(1.1), 0.5, 1.0)          # hook explosion
place(fx, riser(1.4, 150, 3000), 0.6, 0.7)
place(fx, impact(1.2), 2.0, 1.0)          # title hit
place(fx, impact(0.6), 12.0, 0.8)
place(fx, riser(2.0, 120, 2400), 30.0, 0.7)
place(fx, impact(1.3, 3.2), 32.0, 1.1)    # BOOM
for s in (26.0, 38.0, 20.0):
    place(fx, impact(0.45, 1.5), s, 0.7)
place(fx, riser(2.0, 100, 4000), 54.0, 1.0)
place(fx, impact(1.4, 3.0), 56.0, 1.15)   # drop
place(fx, impact(0.8), 66.05, 0.9)
for c in tl['cuts'] + [12.0, 20.0, 44.0]:
    place(fx, whoosh(0.5), c - 0.42, 0.75)
# UI blips: label + caption appearances
blips = [4.6, 5.4, 6.2, 13.8, 14.4, 15.0, 15.6, 16.2, 20.6, 21.2, 26.6, 32.4, 38.6, 59.6, 9.6,
         4.1, 8.0, 12.1, 16.0, 20.1, 26.1, 32.1, 38.1, 44.1, 49.0, 54.1, 58.1, 62.1, 67.6, 49.3]
for b in blips:
    place(fx, blip(2600 if b % 1 > 0.5 else 1900), b, 0.6)
# hook counter ticks (0.6..1.7)
for k in range(24):
    place(fx, blip(3200 + k * 40, 0.03), 0.6 + k * 0.045, 0.35)

# ---------------------------------------------------------------- engine
eng = np.zeros(N)
# real-speed engine sound: active in [2, 20) and [54, 72]
fr = rpm / 60.0 * 0.5                     # cycle frequency (one 4-stroke cycle per 2 revs)
fm = 1 + lp(rng.standard_normal(N), 30) * 0.06 + lp(rng.standard_normal(N), 300) * 0.02
ph = 2 * np.pi * np.cumsum(fr * fm) / SR
cyc = np.floor(np.cumsum(fr) / SR * 12)   # firing index
jit = rng.standard_normal(int(cyc.max()) + 2) * 0.32
jamp = 1 + jit[cyc.astype(int)]
orders = np.arange(1, 73) * 0.5          # half-orders up to 36 (per crank rev → ×2 in cycle units)
load = 0.35 + 0.65 * thr
hot = np.clip((rpm - 3000) / 6000, 0, 1)
for o in orders:
    k = o * 2                                 # multiple of cycle frequency
    f = fr * k
    if np.all(f > 18000): continue
    base = 0.12 / (1 + 0.04 * k)
    if abs(k % 12) < 1e-6: base = 1.0 / (1 + k / 60)    # firing order (6th crank order) & harmonics
    elif abs(k % 6) < 1e-6: base = 0.35 / (1 + k / 50)
    elif abs(k % 2) < 1e-6: base = 0.10
    a = base * (0.6 + 0.8 * hot * (k / 72)) * (f < 16000)
    eng += np.sin(ph * k + rng.uniform(0, 6)) * a
eng *= jamp * load
# combustion rasp — noise gated by firing pulses
fire_ph = (np.cumsum(fr) / SR * 12) % 1.0
gate = np.exp(-fire_ph * 6)
rasp = bp(rng.standard_normal(N), 500, 7000) * gate * (0.25 + 0.6 * thr) * (0.3 + hot)
intake = bp(rng.standard_normal(N), 400, 3000) * thr * (0.1 + 0.5 * hot) * 0.5
eng = eng * 0.5 + rasp * 0.75 + intake * 0.4
eng = np.tanh(eng * (1.4 + 1.6 * thr))
eng = bp(eng, 35, 14000, 2)
# starter cranking 2.0..2.6
n0, n1 = at(2.0), at(2.6)
tt = t[n0:n1] - 2.0
crank_snd = (np.sin(2 * np.pi * 1600 * tt) * 0.15 + bp(rng.standard_normal(n1 - n0), 300, 1500) * 0.5) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 9 * tt)))
eng[n0:n1] = crank_snd * 0.6
# section gating: engine audible only at real speed
g = np.zeros(N)
g += np.clip(np.minimum((t - 2.0) / 0.02, (20.0 - t) / 1.2), 0, 1) * np.where(t < 4.6, 1.0, 0.45)
g += np.clip(np.minimum((t - 54.0) / 0.4, (72 - t) / 1.5), 0, 1) * np.where(t < 56, 0.8, 1.0)
g = np.clip(g, 0, 1)
# idle under music is quieter; drop section louder
eng *= g
eng *= np.where((t > 4.6) & (t < 20), 0.75, 1.0)

# slow-motion firing thumps (19..54) from the visual crank angle
thump = np.zeros(N)
firing_angles = (theta + 30) / 60.0
idx = np.where(np.diff(np.floor(firing_angles)) > 0)[0]
for i in idx:
    ts = i / SR
    if 19.5 < ts < 54:
        n = int(0.7 * SR); tt2 = np.arange(n) / SR
        th = np.sin(2 * np.pi * (48 + 40 * np.exp(-tt2 * 20)) * tt2) * np.exp(-tt2 * 6)
        thump[i:i + n] += th[:max(0, min(n, N - i))] * (0.45 if ts > 44 else 0.6)
# exhaust pops / flames
for (t0, I, b) in tl['flames']:
    place(fx, pop(I), t0, 0.9)
for k in range(28):   # overrun crackle 66..69
    ts = 66.1 + rng.uniform(0, 3.0)
    place(fx, pop(rng.uniform(0.25, 0.7)), ts, 0.6)

# ---------------------------------------------------------------- mix
mus = drums * 0.9 + bassb * 0.85 + bells * 0.75 + pads * 0.8
mus = reverb(mus, 1.4, 0.12)
bells_wet = reverb(bells, 2.2, 0.35) - bells
mus += bells_wet * 0.4
fx = reverb(fx, 2.0, 0.22)
# sidechain-ish duck of music under impacts at 0.5/2/32/56
duck = np.ones(N)
for s in (0.5, 2.0, 32.0, 56.0):
    duck -= 0.5 * np.exp(-np.clip(t - s, 0, None) * 4) * (t >= s)
mus *= np.clip(duck, 0.3, 1)
# music level per section
ml = np.interp(t, [0, 4, 4.01, 20, 20.5, 44, 44.2, 54, 56, 56.01, 66, 72], [0.0, 0.0, 0.9, 0.9, 0.75, 0.75, 0.9, 0.9, 0.0, 1.0, 1.0, 0.8])
mix_mono = mus * ml + fx * 0.95 + eng * 0.8 + thump * 0.9 + pads * 0.0
# stereo: width via short delays on bells/fx/engine
L = mix_mono.copy(); R = mix_mono.copy()
d = int(0.011 * SR)
wide = bells * 0.75 * ml + hp(fx, 1500) * 0.3
L[d:] += wide[:-d] * 0.25; R += wide * 0.25
el = int(0.004 * SR)
R[el:] += eng[:-el] * 0.12
out = np.stack([L, R], 1)
out[: at(0.05)] *= np.linspace(0, 1, at(0.05))[:, None]
fade = np.clip((72 - t) / 1.2, 0, 1)[:, None]
out *= fade
out /= np.max(np.abs(out)) + 1e-9
out *= 0.9
wavfile.write(sys.argv[2], SR, out.astype(np.float32))
print('wrote', sys.argv[2])
