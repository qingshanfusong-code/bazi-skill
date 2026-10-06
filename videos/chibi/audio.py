"""赤壁之战配乐/音效合成（纯 numpy），与 scene.js 的时间轴对齐。

用法: python3 audio.py out.wav
"""
import sys
import wave
import numpy as np

SR = 44100
DUR = 48.0
N = int(DUR * SR)
T = np.arange(N) / SR
rng = np.random.default_rng(208)


def noise(n=N, seed=None):
    r = rng if seed is None else np.random.default_rng(seed)
    return r.standard_normal(n)


def filt(x, lo=None, hi=None, order=4):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    f[0] = 1e-3
    g = np.ones_like(f)
    if lo:
        g /= 1 + (lo / f) ** order
    if hi:
        g /= 1 + (f / hi) ** order
    return np.fft.irfft(X * g, len(x))


def env(points):
    ts, vs = zip(*points)
    return np.interp(T, ts, vs)


def place(buf, sig, at, amp=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * amp


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


# ---------------------------------------------------------------- 素材
def taiko(dur=1.6, f0=105, f1=46, dec=0.45, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    freq = f1 + (f0 - f1) * np.exp(-t * 16)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / dec)
    skin = filt(noise(len(t), 1), lo=80, hi=1800) * np.exp(-t * 35) * 0.5 * bright
    return body + skin


def boom(dur=4.0):
    t = np.arange(int(dur * SR)) / SR
    sub = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-t * 6)) / SR) * np.exp(-t / 1.4)
    n = filt(noise(len(t), 2), hi=500) * np.exp(-t / 0.6) * 0.6
    return norm(sub + n)


def braam(dur=4.5, root=73.42):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for f, a in [(root, 1.0), (root * 1.5, 0.6), (root * 2, 0.5), (root * 0.5, 0.7)]:
        for d in (-0.6, 0, 0.7):
            ph = 2 * np.pi * (f + d) * t
            s += a * (2 * ((ph / (2 * np.pi)) % 1) - 1)  # saw
    s = filt(s, hi=700)
    e = np.minimum(1, t / 0.08) * np.exp(-t / 1.6)
    return norm(s * e)


def whoosh(dur=0.7, lo=600, hi=5000, seed=None):
    t = np.arange(int(dur * SR)) / SR
    x = filt(noise(len(t), seed), lo=lo, hi=hi)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return norm(x * e)


def pluck(freq, dur=3.0, bright=1.0):
    """古筝式拨弦：加性合成 + 起音小幅滑音。"""
    t = np.arange(int(dur * SR)) / SR
    bend = 1 + 0.012 * np.exp(-t * 9)
    s = np.zeros_like(t)
    for h in range(1, 14):
        amp = np.sin(h * np.pi * 0.17) / h ** 0.8
        s += amp * np.sin(2 * np.pi * freq * h * np.cumsum(bend) / SR) * np.exp(-t * (1.1 + h * 0.65 * bright))
    s += filt(noise(len(t), int(freq)), lo=2000) * np.exp(-t * 120) * 0.15
    return norm(s) * np.minimum(1, t / 0.003)


def crackles(density_env, seed=5):
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    p = density_env / SR
    hits = np.nonzero(r.random(N) < p)[0]
    grain_t = np.arange(int(0.02 * SR)) / SR
    for i in hits:
        g = r.standard_normal(len(grain_t)) * np.exp(-grain_t * (150 + r.random() * 300)) * (0.3 + r.random())
        j = min(N, i + len(g))
        out[i:j] += g[: j - i]
    return filt(out, lo=900, hi=9000)


# 音名（D 小调五声：D F G A C）
NOTE = {'D3': 146.83, 'F3': 174.61, 'G3': 196.0, 'A3': 220.0, 'C4': 261.63, 'D4': 293.66, 'F4': 349.23,
        'G4': 392.0, 'A4': 440.0, 'C5': 523.25, 'D5': 587.33, 'F5': 698.46}

# ---------------------------------------------------------------- 分轨
drone = np.zeros(N)
for f, a in [(73.42, 1.0), (110.0, 0.5), (146.83, 0.35), (174.61, 0.18)]:
    for d in (-0.15, 0.12):
        drone += a * np.sin(2 * np.pi * (f + d) * T + d * 7)
drone = filt(drone, hi=500) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * T))
drone *= env([(0, 0), (1.5, 0.5), (9.6, 0.6), (14, 0.75), (19.6, 0.9), (22.4, 1.0), (22.5, 0.4), (27.4, 0.8),
              (35.4, 0.8), (40.0, 0.6), (40.6, 0.9), (46, 0.7), (48, 0)])

water = filt(noise(seed=11), lo=80, hi=700) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * T + np.sin(T)))
water *= env([(0, 0), (3.6, 0), (4.5, 0.35), (9.6, 0.3), (14.2, 0.35), (19.6, 0.2), (35.4, 0.2), (36, 0), (48, 0)])

wind = filt(noise(seed=12), lo=200, hi=1600) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.7 * T) * np.sin(2 * np.pi * 0.23 * T))
wind *= env([(0, 0.1), (3.6, 0.12), (9.6, 0.15), (10.9, 0.25), (11.3, 1.0), (13.0, 0.75), (14.2, 0.45), (19.6, 0.3),
             (23.2, 0.3), (27.4, 0.35), (35.4, 0.3), (35.5, 0), (40.2, 0), (41, 0.12), (48, 0)])

fire_env = env([(0, 0), (15.0, 0), (16.0, 0.35), (19.6, 0.45), (19.7, 0.15), (23.2, 0.15), (25, 0.4), (27.4, 0.75),
                (28, 1.0), (35.4, 1.0), (35.5, 0.0), (40.2, 0), (41, 0.1), (47, 0.05), (48, 0)])
roar = filt(noise(seed=13), hi=350) * 1.6 + filt(noise(seed=14), lo=400, hi=2500) * 0.35
roar *= fire_env * (0.8 + 0.2 * np.sin(2 * np.pi * 1.7 * T) * np.sin(2 * np.pi * 0.37 * T))
crk = crackles(fire_env * 70 + env([(0, 0), (33.0, 0), (33.05, 600), (33.8, 0), (48, 0)]), seed=15) * 0.9

drums = np.zeros(N)
TK = taiko()
TKs = taiko(dur=1.0, f0=150, f1=70, dec=0.25, bright=1.5)
for a in (4.0, 6.0, 8.0):
    place(drums, TK, a, 0.35); place(drums, TK, a + 0.33, 0.25)
place(drums, TK, 11.1, 1.0)
for i, a in enumerate(np.arange(12.0, 14.2, 0.75)):
    place(drums, TK, a, 0.55)
place(drums, TK, 15.2, 0.9)
for a in np.arange(14.4, 17.5, 0.5):
    place(drums, TK, a, 0.35 + 0.25 * (a - 14.4) / 3)
for a in np.arange(17.5, 19.6, 0.25):
    place(drums, TKs if int(a * 4) % 2 else TK, a, 0.45 + 0.35 * (a - 17.5) / 2)
place(drums, TK, 20.0, 0.4); place(drums, TK, 21.0, 0.5)
place(drums, TK, 23.2, 1.2)
for a in np.arange(23.7, 27.4, 0.375):
    place(drums, TK if int((a - 23.7) / 0.375) % 3 == 0 else TKs, a, 0.6)
place(drums, TK, 27.4, 1.3)
for k, a in enumerate(np.arange(27.9, 35.2, 0.25)):
    pat = k % 8
    if pat in (0, 3, 6):
        place(drums, TK, a, 0.9)
    elif pat in (2, 5, 7):
        place(drums, TKs, a, 0.45)
place(drums, TK, 33.0, 1.4)

hits = np.zeros(N)
place(hits, boom(), 11.1, 0.5)
place(hits, boom(), 23.2, 0.8)
place(hits, boom(), 27.4, 0.7)
place(hits, boom(), 33.0, 1.0)
place(hits, braam(), 40.6, 0.7)
place(hits, boom(), 40.6, 0.9)
place(hits, boom(), 41.15, 0.6)

sfx = np.zeros(N)
place(sfx, whoosh(1.4, 250, 2500, seed=21), 10.6, 0.8)        # 东风
# 拉弓吱嘎
for k, a in enumerate(np.arange(19.85, 21.35, 0.09)):
    g = filt(noise(int(0.05 * SR), 30 + k), lo=250, hi=1400) * np.exp(-np.arange(int(0.05 * SR)) / SR * 60)
    place(sfx, g, a, 0.25 + 0.2 * (a - 19.8))
riser = filt(noise(int(1.5 * SR), 31), lo=1500, hi=7000) * np.linspace(0, 1, int(1.5 * SR)) ** 2
place(sfx, riser, 20.95, 0.35)
place(sfx, pluck(110.0, 1.2, 2.0), 22.45, 0.7)                  # 弓弦
place(sfx, whoosh(0.5, 900, 6000, seed=32), 22.45, 0.9)         # 箭离弦
# 万箭齐发
vol = np.zeros(N)
r = np.random.default_rng(40)
for k in range(70):
    a = 23.2 + r.random() * 1.8
    place(vol, whoosh(0.5 + r.random() * 0.6, 700 + r.random() * 600, 4000 + r.random() * 3000, seed=100 + k), a, 0.25)
for k in range(50):  # 中箭
    a = 24.8 + r.random() * 2.4
    g = filt(noise(int(0.08 * SR), 300 + k), hi=900) * np.exp(-np.arange(int(0.08 * SR)) / SR * 50)
    place(vol, g, a, 0.25)
sfx += vol
# 气泡（水下）
for k in range(26):
    a = 35.6 + r.random() * 4.4
    n = int(0.05 * SR)
    tt = np.arange(n) / SR
    fq = 350 + r.random() * 500
    place(sfx, np.sin(2 * np.pi * np.cumsum(fq * (1 + tt * 30)) / SR) * np.exp(-tt * 70), a, 0.12)

# 旋律：开场 + 结尾
mel = np.zeros(N)
for a, n, v in [(0.5, 'A4', 0.6), (1.1, 'G4', 0.45), (1.6, 'D4', 0.55), (2.5, 'F4', 0.35), (2.9, 'D4', 0.5)]:
    place(mel, pluck(NOTE[n], 3.0), a, v)
seq = [(42.7, 'D5'), (42.87, 'C5'), (43.04, 'A4'), (43.21, 'G4'), (43.55, 'A4'), (43.72, 'C5'), (43.89, 'A4'),
       (44.4, 'G4'), (44.57, 'A4'), (44.74, 'D4'), (44.91, 'F4'), (45.08, 'G4'), (45.25, 'D4'), (46.0, 'A3'), (46.0, 'D3')]
for a, n in seq:
    place(mel, pluck(NOTE[n], 3.5), a, 0.5)
for a, n in [(36.2, 'D4'), (37.4, 'A3'), (38.6, 'F3')]:  # 水下的回响
    place(mel, pluck(NOTE[n], 3.0, 0.6), a, 0.35)

# ---------------------------------------------------------------- 混音
mix = (drone * 0.22 + water * 0.12 + wind * 0.18 + roar * 0.22 + crk * 0.10 + drums * 0.42 + hits * 0.5
       + sfx * 0.35 + mel * 0.32)

# 水下：低通闷音
under = env([(0, 0), (35.35, 0), (35.6, 1), (40.0, 1), (40.25, 0), (48, 0)])
mix = mix * (1 - under) + filt(mix, hi=380) * under * 1.4
rumble = filt(noise(seed=50), hi=120) * under * 0.6
mix += rumble


def reverb(x, seed, length=2.6, decay=0.75):
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-t / decay)
    ir = filt(np.pad(ir, (0, 0)), hi=6000)
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L)[: len(x)]
    return y


wet_l, wet_r = reverb(mix, 1), reverb(mix, 2)
left = mix + wet_l * 0.35
right = mix + wet_r * 0.35
st = np.stack([left, right], 1)
dyn = env([(0, 0), (0.05, 0.45), (9.6, 0.55), (14.2, 0.7), (19.6, 0.78), (23.2, 1.0), (35.4, 1.0), (35.6, 0.7),
           (40.2, 0.65), (40.6, 1.0), (46.8, 0.85), (48, 0)])
st *= dyn[:, None]
st = np.tanh(st / (np.max(np.abs(st)) + 1e-9) * 1.15)  # 柔和限幅
st = st / np.max(np.abs(st)) * 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'chibi.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('wrote', out)
