import numpy as np, json
SR=48000; D=64.0; N=int(SR*D)
T=json.load(open('timing.json'))['T']
t=np.arange(N)/SR
rng=np.random.default_rng(7)
L=np.zeros(N);R=np.zeros(N)
def lp(x,a):  # one-pole lowpass, a in (0,1)
    y=np.empty_like(x);s=0.0
    from scipy.signal import lfilter
    return lfilter([a],[1,-(1-a)],x)
try:
    import scipy
except ImportError:
    raise SystemExit('need scipy')
from scipy.signal import lfilter, butter, sosfilt
def bp(x,lo,hi): return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x)
def lowp(x,f): return sosfilt(butter(2,f,fs=SR,output='sos'),x)
def add(sig,start,gain=1.0,pan=0.0):
    i=int(start*SR); n=min(len(sig),N-i)
    if n<=0: return
    L[i:i+n]+=sig[:n]*gain*np.sqrt((1-pan)/2); R[i:i+n]+=sig[:n]*gain*np.sqrt((1+pan)/2)
# ---------- music: dark pad + pulse (D minor), 96 bpm
bpm=96; beat=60/bpm
def saw(f,tt): return 2*((tt*f)%1)-1
pad=np.zeros(N)
chords=[[38,45,50,53],[34,41,46,50],[36,43,48,52],[33,40,45,49]]  # Dm Bb C A (midi)
def mf(m): return 440*2**((m-69)/12)
bar=beat*4*2
for k in range(int(D/bar)+1):
    ch=chords[k%4]; s=int(k*bar*SR); e=min(N,int((k+1)*bar*SR)+SR//2)
    if s>=N: break
    tt=t[s:e]-t[s]
    seg=sum(saw(mf(m),tt)+saw(mf(m)*1.004,tt) for m in ch)/8
    env=np.minimum(1,tt/0.6)*np.minimum(1,(e/SR-t[s:e])/0.5)
    pad[s:e]+=seg*env
pad=lowp(pad,900)*0.35
# peace section: switch to warm major (D major-ish) after k_q-0.6
peaceT=T['k_q']-0.6
w=np.clip((t-peaceT)/1.0,0,1)
warm=sum(np.sin(2*np.pi*mf(m)*t)*0.12 for m in [50,57,62,66,69])
pad=pad*(1-w)+warm*w*np.clip((D-t)/1.5,0,1)
# sub drone
drone=np.sin(2*np.pi*mf(26)*t)*0.25*(1-w)
# pulse kicks on beats (tension), from s2 to peace
kick_len=int(0.35*SR); kt=np.arange(kick_len)/SR
kick=np.sin(2*np.pi*(45+80*np.exp(-kt*30))*kt)*np.exp(-kt*9)
bt=0.0;mus=pad+drone
mL=mus.copy();mR=mus.copy()
L+=mL;R+=mR
b=T['s2']
while b<peaceT-0.2:
    add(kick,b,0.55)
    b+=beat
# ticking hi-hat (16ths) for drive
hh_len=int(0.05*SR);hh=bp(rng.standard_normal(hh_len),6000,12000)*np.exp(-np.arange(hh_len)/SR*80)
b=T['s2'];i=0
while b<peaceT-0.2:
    add(hh,b,0.10 if i%2 else 0.18,pan=0.3 if i%2 else -0.3); b+=beat/2;i+=1
# ---------- SFX
def whoosh(dur=0.8,up=True):
    n=int(dur*SR);x=rng.standard_normal(n);tt=np.arange(n)/SR
    out=np.zeros(n);
    # sweeping bandpass via chunks
    ch=512
    for j in range(0,n,ch):
        k=j/n; f=300+(4000 if up else -0)*k if up else 4000-3500*k
        seg=x[j:j+ch]; out[j:j+ch]=seg
    out=bp(out,300,5000)
    env=np.sin(np.pi*np.clip(tt/dur,0,1))**2
    return out*env*0.5
def impact():
    n=int(1.6*SR);tt=np.arange(n)/SR
    boom=np.sin(2*np.pi*(38+60*np.exp(-tt*12))*tt)*np.exp(-tt*3.2)
    crack=lowp(rng.standard_normal(n),2500)*np.exp(-tt*18)*0.6
    return (boom+crack)*0.9
def riser(dur):
    n=int(dur*SR);tt=np.arange(n)/SR
    return bp(rng.standard_normal(n),800,6000)*(tt/dur)**2*0.35
def ding():
    n=int(0.6*SR);tt=np.arange(n)/SR
    return (np.sin(2*np.pi*1320*tt)+0.5*np.sin(2*np.pi*1980*tt))*np.exp(-tt*7)*0.25
def tick_roll(dur):
    n=int(dur*SR);out=np.zeros(n)
    for k in np.arange(0,dur,0.04):
        i=int(k*SR);m=min(400,n-i);out[i:i+m]+=np.sin(2*np.pi*2400*np.arange(m)/SR)*np.exp(-np.arange(m)/SR*300)*0.12
    return out
def jet(dur,pan_from,pan_to,start,gain):
    n=int(dur*SR);tt=np.arange(n)/SR
    x=bp(rng.standard_normal(n),200,3000)+0.4*bp(rng.standard_normal(n),3000,8000)
    env=np.exp(-((tt-dur/2)/(dur/4))**2)
    sig=x*env*gain
    p=np.linspace(pan_from,pan_to,n)
    i=int(start*SR);m=min(n,N-i)
    L[i:i+m]+=sig[:m]*np.sqrt((1-p[:m])/2);R[i:i+m]+=sig[:m]*np.sqrt((1+p[:m])/2)
def rumble(start,dur,gain):
    n=int(dur*SR);tt=np.arange(n)/SR
    x=lowp(rng.standard_normal(n),120)*3+lowp(rng.standard_normal(n),400)*0.5*(0.5+0.5*np.sin(2*np.pi*11*tt))
    env=np.minimum(1,tt/0.8)*np.minimum(1,(dur-tt)/0.8)
    add(x*env,start,gain)
def march(start,end):
    b=start
    while b<end:
        n=int(0.12*SR);tt=np.arange(n)/SR
        st=lowp(rng.standard_normal(n),900)*np.exp(-tt*40)*1.5
        add(st,b,0.35,pan=-0.3);add(st,b+beat/2,0.3,pan=0.3);b+=beat
def waves(start,dur):
    n=int(dur*SR);tt=np.arange(n)/SR
    x=lowp(rng.standard_normal(n),700)*(0.6+0.4*np.sin(2*np.pi*0.25*tt))
    env=np.minimum(1,tt/0.6)*np.minimum(1,(dur-tt)/0.6)
    add(x*env,start,0.25)
def sonar(start):
    n=int(1.5*SR);tt=np.arange(n)/SR
    add(np.sin(2*np.pi*1100*tt)*np.exp(-tt*3)*0.25,start,1.0)
# scene transitions
for k in ['s2','s3','s4','s5','s6','s7']:
    add(whoosh(0.7),T[k]-0.5,0.9); add(impact(),T[k],0.8)
add(riser(2.0),T['s2']-2.0,1.0)
add(impact(),0.05,0.9)
add(whoosh(1.2),1.0,0.6)
# opening jets
jet(3.0,-1,1,3.0,0.5); jet(3.0,1,-1,3.6,0.4)
# counters: tick roll + ding + hit
for k,d in [('p_in',1.4),('p_pk',1.0),('t_in',1.2),('t_pk',1.0),('a_in',0.9),('a_pk',0.9),('n_sub',0.8),('n_pksub',0.6)]:
    add(tick_roll(d),T[k],1.0); add(ding(),T[k]+d,1.0); add(impact(),T[k],0.35)
for k in ['n_car','n_pkcar']: add(impact(),T[k],0.45); add(ding(),T[k]+0.1,0.8)
march(T['s2']+0.3,T['s3']-0.3)
rumble(T['s3'],T['s4']-T['s3'],0.9)
for i in range(5): jet(2.0,-1,1,T['s4']+i*0.62,0.35)
for i in range(4): jet(2.0,1,-1,T['s4']+0.3+i*0.7,0.3)
for k in ['a_train','a_tech','a_strat','a_def']: add(ding(),T[k],0.9); add(whoosh(0.4),T[k]-0.2,0.5)
waves(T['s5'],T['s6']-T['s5']); sonar(T['n_sub']); sonar(T['n_pksub'])
for k in ['c_lhr','c_skt','c_khi']: add(ding(),T[k],0.7)
add(impact(),T['k_nuke'],1.0); add(riser(1.6),T['k_loss']-1.6,1.0); add(impact(),T['k_loss'],1.1)
add(whoosh(1.0),T['k_q']-0.6,0.8)
# heartbeat during tense nuclear
b=T['s7']
while b<T['k_q']-0.6:
    n=int(0.2*SR);tt=np.arange(n)/SR;hb=np.sin(2*np.pi*50*tt)*np.exp(-tt*25)
    add(hb,b,0.6);add(hb,b+0.22,0.45);b+=0.85
mix=np.stack([L,R],1)
mix/=np.max(np.abs(mix))+1e-9
np.save('bed.npy',(mix*0.9).astype(np.float32))
import wave
pcm=(mix*0.9*32767).astype(np.int16)
with wave.open('bed.wav','wb') as wf:
    wf.setnchannels(2);wf.setsampwidth(2);wf.setframerate(SR);wf.writeframes(pcm.tobytes())
print('ok')
