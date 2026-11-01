import numpy as np, json, wave
from scipy.signal import butter, sosfilt
SR=48000; D=65.0; N=int(SR*D)
T=json.load(open('timing.json'))['T']
t=np.arange(N)/SR; rng=np.random.default_rng(11)
L=np.zeros(N);R=np.zeros(N)
def bp(x,lo,hi): return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x)
def lowp(x,f): return sosfilt(butter(2,f,fs=SR,output='sos'),x)
def add(sig,start,gain=1.0,pan=0.0):
    i=int(start*SR); n=min(len(sig),N-i)
    if n<=0 or i<0: return
    L[i:i+n]+=sig[:n]*gain*np.sqrt((1-pan)/2); R[i:i+n]+=sig[:n]*gain*np.sqrt((1+pan)/2)
def mf(m): return 440*2**((m-69)/12)
def saw(f,tt): return 2*((tt*f)%1)-1
# ---- music: dark cinematic pad (C minor), 100 bpm pulse
bpm=100; beat=60/bpm; bar=beat*8
chords=[[36,43,48,51],[32,39,44,48],[34,41,46,50],[31,38,43,47]]  # Cm Ab Bb G
pad=np.zeros(N)
for k in range(int(D/bar)+1):
    ch=chords[k%4]; s=int(k*bar*SR); e=min(N,int((k+1)*bar*SR)+SR//2)
    if s>=N: break
    tt=t[s:e]-t[s]
    seg=sum(saw(mf(m),tt)+saw(mf(m)*1.005,tt) for m in ch)/8
    env=np.minimum(1,tt/0.6)*np.minimum(1,(e/SR-t[s:e])/0.5)
    pad[s:e]+=seg*env
pad=lowp(pad,850)*0.32+np.sin(2*np.pi*mf(24)*t)*0.22
fade=np.clip((D-t)/2.5,0,1); pad*=fade
L+=pad;R+=pad
kick_len=int(0.35*SR);kt=np.arange(kick_len)/SR
kick=np.sin(2*np.pi*(45+80*np.exp(-kt*30))*kt)*np.exp(-kt*9)
hh_len=int(0.05*SR);hh=bp(rng.standard_normal(hh_len),6000,12000)*np.exp(-np.arange(hh_len)/SR*80)
b=T['s2']-beat*4;i=0
while b<T['q_end']-0.3:
    if i%2==0: add(kick,b,0.5)
    add(hh,b,0.08 if i%2 else 0.14,pan=0.3 if i%2 else -0.3); b+=beat/2;i+=1
# ---- sfx
def whoosh(dur=0.7):
    n=int(dur*SR);tt=np.arange(n)/SR
    return bp(rng.standard_normal(n),300,5000)*np.sin(np.pi*np.clip(tt/dur,0,1))**2*0.5
def impact(g=1.0):
    n=int(1.6*SR);tt=np.arange(n)/SR
    return (np.sin(2*np.pi*(38+60*np.exp(-tt*12))*tt)*np.exp(-tt*3.2)+lowp(rng.standard_normal(n),2500)*np.exp(-tt*18)*0.6)*0.9*g
def riser(dur):
    n=int(dur*SR);tt=np.arange(n)/SR
    return bp(rng.standard_normal(n),800,6000)*(tt/dur)**2*0.35
def ding():
    n=int(0.6*SR);tt=np.arange(n)/SR
    return (np.sin(2*np.pi*1320*tt)+0.5*np.sin(2*np.pi*1980*tt))*np.exp(-tt*7)*0.25
def tick_roll(dur):
    n=int(dur*SR);out=np.zeros(n)
    for k in np.arange(0,dur,0.045):
        i=int(k*SR);m=min(400,n-i);out[i:i+m]+=np.sin(2*np.pi*2400*np.arange(m)/SR)*np.exp(-np.arange(m)/SR*300)*0.12
    return out
def radar_ping(f=1150):
    n=int(1.4*SR);tt=np.arange(n)/SR
    return np.sin(2*np.pi*f*tt)*np.exp(-tt*3.5)*0.22
def missile_whoosh(dur,p0,p1,start,gain):
    n=int(dur*SR);tt=np.arange(n)/SR
    x=bp(rng.standard_normal(n),500,4000)+0.5*lowp(rng.standard_normal(n),300)
    env=np.minimum(1,tt/0.3)*np.exp(-np.maximum(0,tt-dur*0.6)*4)
    p=np.linspace(p0,p1,n);sig=x*env*gain;i=int(start*SR);m=min(n,N-i)
    L[i:i+m]+=sig[:m]*np.sqrt((1-p[:m])/2);R[i:i+m]+=sig[:m]*np.sqrt((1+p[:m])/2)
def zap():
    n=int(0.35*SR);tt=np.arange(n)/SR
    return np.sin(2*np.pi*(2400-1800*tt/0.35)*tt)*np.exp(-tt*10)*0.18
def glitch(dur):
    n=int(dur*SR);x=rng.standard_normal(n)
    gate=(np.floor(np.arange(n)/(SR*0.03))%3==0)
    return bp(x,1500,7000)*gate*0.25
for k in ['s2','s3','s4','s5','s6','s7']:
    add(whoosh(0.7),T[k]-0.5,0.9); add(impact(0.8),T[k])
add(impact(1.0),0.05); add(whoosh(1.2),0.6,0.6)
for i in range(3): add(radar_ping(),T['q1']+0.4+i*1.6,0.8)
missile_whoosh(2.6,0.6,-0.6,T['q3']+0.2,0.45)
add(impact(0.5),T['q3']+2.6)
add(riser(1.6),T['q4']-0.2,0.8)
for i in range(4): add(impact(0.25),T['q4']+1.4+i*0.35)
# counters
for st,d in [(T['ir_n']+0.5,1.4),(T['is_n']+0.5,1.2),(T['n2500']+2.2,1.3),(T['s4']+1.6,1.2),(T['n611']-0.2,1.3),(T['n363']-0.2,1.3)]:
    add(tick_roll(d),st,1.0); add(ding(),st+d,1.0); add(impact(0.3),st+d)
add(ding(),T['more'],0.8); add(ding(),T['n2500'],0.7)
add(glitch(1.2),T['unc'],1.0); add(impact(0.7),T['unc']+0.2)
for i in range(3): add(radar_ping(900),T['s4']+0.4+i*1.2,0.7)
add(riser(1.2),T['inrange']-0.6,0.8); add(impact(0.6),T['inrange']+0.2)
# defence layers
for k in range(4): add(zap(),T['s5']+[0.35,1.1,1.8,2.4][k],1.0); add(ding(),T['s5']+[0.35,1.1,1.8,2.4][k]+0.1,0.5)
for i,dt in enumerate([2.7,3.0,3.35,3.7,4.1,4.3]):
    missile_whoosh(0.7,-0.5 if i%2 else 0.5,0,T['s5']+dt,0.3); add(impact(0.35),T['s5']+dt+0.55,pan=0.2*(-1)**i)
add(glitch(0.5),T['s5']+4.6,0.7)
# scene 7
add(whoosh(1.4),T['usrole']+0.2,0.6); add(riser(1.5),T['alone']-1.5,0.9); add(impact(1.0),T['alone'])
add(riser(2.0),T['q_end']-2.0,0.9); add(impact(1.2),T['q_end'])
# heartbeat to the end
b=T['alone']+0.3
while b<64.0:
    n=int(0.2*SR);tt=np.arange(n)/SR;hb=np.sin(2*np.pi*50*tt)*np.exp(-tt*25)
    add(hb,b,0.6);add(hb,b+0.22,0.45);b+=0.85
mix=np.stack([L,R],1);mix/=np.max(np.abs(mix))+1e-9
pcm=(mix*0.9*32767).astype(np.int16)
with wave.open('bed.wav','wb') as wf:
    wf.setnchannels(2);wf.setsampwidth(2);wf.setframerate(SR);wf.writeframes(pcm.tobytes())
print('ok')
