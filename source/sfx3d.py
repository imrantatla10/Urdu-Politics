# Builds music + SFX bed (bed3d.wav) aligned to words_timing.json at tempo 1.12, lead 0.5
import numpy as np, json, wave
from scipy.signal import butter, sosfilt
SR=48000; TEMPO=1.12; LEAD=0.5
W=json.load(open('words_timing.json')); K=W['K']; D=LEAD+W['orig_len']/TEMPO+1.6; N=int(SR*D)
T={k:LEAD+v/TEMPO for k,v in K.items()}
t=np.arange(N)/SR; rng=np.random.default_rng(3); L=np.zeros(N); R=np.zeros(N)
def bp(x,lo,hi): return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x)
def lowp(x,f): return sosfilt(butter(2,f,fs=SR,output='sos'),x)
def add(sig,start,gain=1.0,pan=0.0):
    i=int(start*SR); n=min(len(sig),N-i)
    if n<=0 or i<0: return
    L[i:i+n]+=sig[:n]*gain*np.sqrt((1-pan)/2); R[i:i+n]+=sig[:n]*gain*np.sqrt((1+pan)/2)
mf=lambda m:440*2**((m-69)/12)
saw=lambda f,tt:2*((tt*f)%1)-1
# mood per section: civil=warm (major-ish), military=dark minor + drums
civ=[(0,T['s2']),(T['s4'],T['s5']),(T['s6'],T['s6_1999']),(T['s7'],T['facade'])]
def is_civ(x): return any(a<=x<b for a,b in civ)
bpm=92; beat=60/bpm; bar=beat*4
dark=[[38,45,50,53],[34,41,46,50],[36,43,48,51],[33,40,45,49]]
warm=[[38,45,50,54],[43,50,55,59],[40,47,52,55],[45,52,57,61]]
pad=np.zeros(N)
for k in range(int(D/bar)+1):
    s=int(k*bar*SR); e=min(N,int((k+1)*bar*SR)+SR//3)
    if s>=N: break
    ch=(warm if is_civ(k*bar) else dark)[k%4]; tt=t[s:e]-t[s]
    seg=sum(saw(mf(m),tt)+saw(mf(m)*1.005,tt) for m in ch)/8
    env=np.minimum(1,tt/0.4)*np.minimum(1,(e/SR-t[s:e])/0.3)
    pad[s:e]+=seg*env
pad=lowp(pad,1100)*0.32
drone=np.sin(2*np.pi*mf(26)*t)*0.22
L+=pad+drone; R+=pad+drone
kl=int(0.35*SR); kt=np.arange(kl)/SR; kick=np.sin(2*np.pi*(45+90*np.exp(-kt*30))*kt)*np.exp(-kt*9)
snl=int(0.25*SR); snt=np.arange(snl)/SR; snare=bp(rng.standard_normal(snl),1500,7000)*np.exp(-snt*22)*0.6
hl=int(0.05*SR); hh=bp(rng.standard_normal(hl),6000,12000)*np.exp(-np.arange(hl)/SR*80)
b=T['s1']; i=0
while b<D-2.5:
    mil=not is_civ(b)
    add(kick,b,0.6 if mil else 0.35)
    if mil and i%2==1: add(snare,b,0.45)
    add(hh,b+beat/2,0.12,pan=0.3); b+=beat; i+=1
def impact(g=1):
    n=int(1.8*SR);tt=np.arange(n)/SR
    return (np.sin(2*np.pi*(36+70*np.exp(-tt*12))*tt)*np.exp(-tt*3)+lowp(rng.standard_normal(n),2500)*np.exp(-tt*16)*0.6)*g
def whoosh(dur=0.8):
    n=int(dur*SR);tt=np.arange(n)/SR;return bp(rng.standard_normal(n),300,5000)*np.sin(np.pi*tt/dur)**2*0.5
def riser(dur): n=int(dur*SR);tt=np.arange(n)/SR;return bp(rng.standard_normal(n),800,6000)*(tt/dur)**2*0.35
def ding(): n=int(0.6*SR);tt=np.arange(n)/SR;return (np.sin(2*np.pi*1320*tt)+0.5*np.sin(2*np.pi*1980*tt))*np.exp(-tt*7)*0.22
def ticks(dur):
    n=int(dur*SR);o=np.zeros(n)
    for k in np.arange(0,dur,0.05):
        i=int(k*SR);m=min(400,n-i);o[i:i+m]+=np.sin(2*np.pi*2400*np.arange(m)/SR)*np.exp(-np.arange(m)/SR*300)*0.1
    return o
def thunder(): n=int(3*SR);tt=np.arange(n)/SR;return lowp(rng.standard_normal(n),300)*np.exp(-tt*1.2)*3
def rumble(start,dur,g):
    n=int(dur*SR);tt=np.arange(n)/SR;x=lowp(rng.standard_normal(n),120)*3*np.minimum(1,tt/0.8)*np.minimum(1,(dur-tt)/0.8);add(x,start,g)
def crowd(start,dur,g):
    n=int(dur*SR);tt=np.arange(n)/SR;x=bp(rng.standard_normal(n),300,2500)*(0.7+0.3*np.sin(2*np.pi*0.7*tt))*np.minimum(1,tt/0.6)*np.minimum(1,(dur-tt)/0.8);add(x,start,g)
def rain(start,dur,g):
    n=int(dur*SR);x=bp(rng.standard_normal(n),2000,9000)*np.minimum(1,np.arange(n)/SR/0.4);add(x,start,g)
def clank(): n=int(0.9*SR);tt=np.arange(n)/SR;return sum(np.sin(2*np.pi*f*tt)*np.exp(-tt*a) for f,a in [(520,6),(1310,9),(2210,12)])*0.25+impact(0.5)[:n]
scenes=['s1','boat','s2','s3','s4','s5','claw','s6','s6_1999','s7','s8']
for k in scenes: add(whoosh(0.7),T[k]-0.5,0.8); add(impact(),T[k],0.55)
add(impact(),0.05,0.9); add(riser(2.0),T['s1']-2.0,0.8)
for k in ['q_1947','q_2026','s1_1947','s2_1958','s5','s6_1999','s7_2026','f_1947','f_2026']: add(impact(0.7),T[k],0.6)
# counters
for k,d in [('liaq_4',1.4),('boat_k',1.4),('ayub_10',1.4),('yahya_2',1.4),('bhutto_4',1.4),('zia_11',1.4),('mush_8',1.4)]:
    add(ticks(d),T[k],1.0); add(ding(),T[k]+d,1.0)
add(ticks(1.4),T['lolly']-1.2,1.0); add(ding(),T['lolly']+0.2,1.0)
crowd(T['s1'],T['boat']-T['s1'],0.18); rain(T['boat'],T['s2']-T['boat'],0.25)
fl=T['boat']; add(thunder(),fl+1.7,0.5); add(thunder(),fl+3.15,0.4)
rumble(T['s2'],T['ayub']-T['s2']+1,0.9); rumble(T['s6_1999'],T['mush']-T['s6_1999'],0.8)
crowd(T['s4'],T['breath']-T['s4']+1,0.25)
add(impact(1.3),T['uniform']+0.6,0.9); add(clank(),T['claw']+1.8,0.9)
add(riser(2.5),T['facade']-2.5,0.6)
add(riser(2.0),T['f_79']-2.0,0.8); add(impact(1.2),T['f_79'],0.9); add(impact(),T['f_33'],0.8); add(impact(),T['f_46'],0.8); add(impact(1.3),T['khaki'],1.0)
mix=np.stack([L,R],1)
fade=np.ones(N); fo=int(1.5*SR); fade[-fo:]=np.linspace(1,0,fo); mix*=fade[:,None]
mix/=np.max(np.abs(mix))+1e-9
with wave.open('work/bed3d.wav','wb') as wf:
    wf.setnchannels(2);wf.setsampwidth(2);wf.setframerate(SR);wf.writeframes((mix*0.9*32767).astype(np.int16).tobytes())
print('bed',D)
