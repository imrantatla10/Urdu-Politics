# Synthesises all sound effects from the timeline exported by the renderer (audio.json).
# usage: python3 sfx.py audio.json out.wav
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
A = json.load(open(sys.argv[1]))
D = A['total'] + 0.3; N = int(SR * D); t = np.arange(N) / SR
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)

def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 100), fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, btype='high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], btype='band', fs=SR, output='sos'), x)
def add(sig, start, g=1.0, pan=0.0):
    i = int(start * SR)
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), N - i)
    if n <= 0: return
    L[i:i + n] += sig[:n] * g * np.sqrt((1 - pan) / 2) * 1.414
    R[i:i + n] += sig[:n] * g * np.sqrt((1 + pan) / 2) * 1.414
def env(n, a, d):  # attack/decay seconds
    x = np.arange(n) / SR; return np.minimum(1, x / max(a, 1e-4)) * np.exp(-x / d)
def noise(n): return rng.standard_normal(n)
def slowmo(sig, rate):  # pitch/time stretch for slow motion moments
    if rate >= 0.99: return sig
    r = rate ** 0.55; n2 = int(len(sig) / r); return np.interp(np.arange(n2) * r, np.arange(len(sig)), sig)

# ------------------------------------------------ continuous layers from frames
F = A['frames']; ft = np.array([f['t'] for f in F])
def track(key, conv=float): return np.interp(t, ft, np.array([conv(f[key]) for f in F]))
v = track('v'); rate = track('rate'); pol = track('police'); dcam = track('dcam')
kinds = [f['kind'] for f in F]
kidx = np.searchsorted(ft, t, side='right') - 1; kidx = np.clip(kidx, 0, len(F) - 1)
kind_arr = np.array(kinds)[kidx]

# engine
base = np.select([kind_arr == 'bike', kind_arr == 'tractor', np.isin(kind_arr, ['lambo', 'porsche'])], [95.0, 26.0, 52.0], 46.0)
slope = np.select([kind_arr == 'bike', kind_arr == 'tractor', np.isin(kind_arr, ['lambo', 'porsche'])], [4.2, 1.6, 2.2], 2.0)
span = np.where(kind_arr == 'tractor', 50.0, 13.0)
gearfrac = (v % span) / span
f_eng = (base + slope * v) * (0.82 + 0.45 * gearfrac) * rate ** 0.6
f_eng = lp(f_eng, 8, 1)  # smooth gear changes a little
ph = np.cumsum(2 * np.pi * f_eng / SR)
saw = lambda p: 2 * ((p / (2 * np.pi)) % 1) - 1
eng = 0.5 * saw(ph) + 0.28 * saw(2.003 * ph) + 0.22 * np.sign(np.sin(0.5 * ph)) + 0.15 * noise(N) * (0.5 + 0.5 * np.sin(0.5 * ph))
tractor_eng = np.maximum(saw(ph), 0) ** 3 * 2 - 0.3 + 0.1 * noise(N)
eng = np.where(kind_arr == 'tractor', tractor_eng, eng)
eng = lp(eng, 2600) * 0.6 + lp(eng, 700) * 0.6
egain = np.clip(v / 8, 0, 1) * 0.30 / (1 + dcam / 14) * (0.75 + 0.25 * rate)
egain = np.where(kind_arr == 'tractor', np.maximum(egain, 0.12 / (1 + dcam / 14)), egain)
egain = lp(egain, 6, 1)
add(eng * egain, 0, 1.0)

# wind / tyre roar
wind = lp(noise(N), 900) * 0.5 + bp(noise(N), 150, 400) * 0.6
add(wind * np.clip(v / 55, 0, 1) * 0.16 * (0.5 + 0.5 * rate), 0, 1.0)

# police sirens (wail)
sf = 680 + 520 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 2.4))
sph = np.cumsum(2 * np.pi * sf * rate ** 0.5 / SR)
siren = (np.abs(saw(sph)) * 2 - 1) * 0.6 + np.sin(sph * 2) * 0.25
siren = bp(siren, 400, 3500)
sg = np.where(pol < 260, 0.20 / (1 + pol / 28), 0); sg = lp(sg, 5, 1)
add(siren * sg, 0, 1.0, pan=-0.2)
add(siren * sg * 0.6, 0.012, 1.0, pan=0.3)

# ------------------------------------------------ one-shots
def thump(k, dur=0.5, f0=120, f1=42):
    n = int(SR * dur * 2); x = np.arange(n) / SR; f = f1 + (f0 - f1) * np.exp(-x / 0.08)
    return np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-x / dur) * k
def impact(k, big=False):
    n = int(SR * (2.5 if big else 1.4)); x = np.arange(n) / SR
    s = np.zeros(n)
    th = thump(1.0, 0.6 if big else 0.4); s[:len(th)] += th[:n] * 1.2
    s += lp(noise(n), 4000) * np.exp(-x / (0.35 if big else 0.22)) * 0.9
    for f, d in [(380, 0.5), (920, 0.35), (1650, 0.25), (2750, 0.18)]:
        s += bp(noise(n) * np.exp(-x / 0.03), f * 0.92, f * 1.08) * np.exp(-x / d) * 6
    clicks = np.zeros(n)
    for i in range(70 if big else 40):
        p = int(abs(rng.normal(0, 0.18 if big else 0.12)) * SR) % n; clicks[p:p + 200] += noise(200) * np.exp(-np.arange(200) / 40) * rng.uniform(0.3, 1)
    s += hp(clicks, 1500) * 0.8
    return s * k
def boom():
    n = int(SR * 3.2); x = np.arange(n) / SR
    s = lp(noise(n), 1400) * np.exp(-x / 0.9) * 1.4 + lp(noise(n), 250) * np.exp(-x / 1.6) * 1.2; th = thump(1.4, 1.2, 80, 30)[:n] * 1.5; s[:len(th)] += th
    return s
def glass():
    n = int(SR * 1.0); s = np.zeros(n)
    for i in range(55):
        st = int(abs(rng.normal(0, 0.18)) * SR); st = min(st, n - 3000); f = rng.uniform(2800, 9000); m = 2500
        x = np.arange(m) / SR; s[st:st + m] += np.sin(2 * np.pi * f * x) * np.exp(-x / rng.uniform(0.01, 0.05)) * rng.uniform(0.2, 0.7)
    s += hp(noise(n), 3000) * np.exp(-np.arange(n) / SR / 0.12) * 0.5
    return s
def screech(dur, k):
    n = int(SR * (dur + 0.3)); x = np.arange(n) / SR
    f = 1700 + 220 * np.sin(2 * np.pi * 5.3 * x) + 140 * lp(noise(n), 3, 1) * 40
    tone = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.45 + np.sin(np.cumsum(2 * np.pi * 1.51 * f / SR)) * 0.2
    s = tone + bp(noise(n), 1200, 4500) * 0.8
    e = np.minimum(1, x / 0.06) * np.clip((dur + 0.25 - x) / 0.25, 0, 1)
    return s * e * k
def horn():
    n = int(SR * 0.9); x = np.arange(n) / SR
    s = sum(np.sign(np.sin(2 * np.pi * f * x)) for f in (196, 247, 294)) / 3
    return lp(s, 1800) * np.minimum(1, x / 0.03) * np.clip((0.9 - x) / 0.1, 0, 1)
def whoosh(dur=0.7):
    n = int(SR * dur); x = np.arange(n) / SR; e = np.sin(np.pi * x / dur) ** 2
    return (bp(noise(n), 200, 1200) * 0.7 + bp(noise(n), 1200, 5000) * 0.3) * e
def beep():
    n = int(SR * 0.3); x = np.arange(n) / SR; s = np.zeros(n)
    for st in (0, 0.13):
        m = (x >= st) & (x < st + 0.08); s[m] = np.sign(np.sin(2 * np.pi * 1046 * x[m])) * 0.6 + np.sin(2 * np.pi * 2093 * x[m]) * 0.2
    return lp(s, 5000)
def win():
    n = int(SR * 1.6); x = np.arange(n) / SR; s = np.zeros(n)
    for i, m in enumerate([72, 76, 79, 84, 88]):
        f = 440 * 2 ** ((m - 69) / 12); st = i * 0.075; mm = x >= st; xx = x[mm] - st
        s[mm] += (np.sin(2 * np.pi * f * xx) + 0.35 * np.sin(4 * np.pi * f * xx) + 0.15 * np.sin(6 * np.pi * f * xx)) * np.exp(-xx / 0.5) * 0.5
    return s + hp(noise(n), 6000) * np.exp(-x / 0.3) * 0.08
def lose():
    n = int(SR * 1.5); x = np.arange(n) / SR; f = 330 * np.exp(-x * 0.8)
    s = sum(saw(np.cumsum(2 * np.pi * f * k / SR)) for k in (1, 1.005, 0.5)) / 3
    out = lp(s, 1600) * np.minimum(1, x / 0.02) * np.exp(-x / 0.8); th = thump(0.8, 0.6, 90, 40)[:n]; out[:len(th)] += th; return out

for e in A['events']:
    ty, st, r = e['type'], e['t'], e.get('rate', 1)
    if ty == 'impact': add(slowmo(impact(0.7 + 0.5 * e.get('k', 0.6)), r), st, 0.75)
    elif ty == 'boom': add(slowmo(boom(), r), st, 0.8); add(slowmo(impact(1.2, True), r), st, 0.6)
    elif ty == 'glass': add(slowmo(glass(), r), st, 0.35, pan=0.25)
    elif ty == 'thud': add(slowmo(impact(0.25 + 0.5 * e.get('k', 0.5)), r), st, 0.45)
    elif ty == 'screech': add(screech(e.get('wlen', e.get('len', 1)), 1.0), st, 0.22 * e.get('k', 1), pan=-0.1)
    elif ty == 'whoosh': add(whoosh(0.8), st, 0.5); add(horn(), st - 0.35, 0.22)
    elif ty == 'trans': add(whoosh(0.4), st, 0.35)
    elif ty == 'beep': add(beep(), st, 0.10)
    elif ty == 'win': add(win(), st, 0.32)
    elif ty == 'lose': add(lose(), st, 0.32)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.89 / np.max(np.abs(mix))
fade = np.clip((D - 0.3 - t) / 0.7, 0, 1)[:, None]; mix *= fade
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print('ok', D, np.max(np.abs(mix)))
