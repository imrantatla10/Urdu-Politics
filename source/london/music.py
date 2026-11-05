# Procedural background music + SFX synced to render.html timeline (25s, 48kHz stereo)
import numpy as np, wave
from scipy.signal import butter, sosfilt
SR=48000; D=25.0; N=int(SR*D); t=np.arange(N)/SR
rng=np.random.default_rng(11)
L=np.zeros(N); R=np.zeros(N)
TL=dict(lonRise=0.5,lonPin=1.5,lonDots=1.9,lonCount=2.1,musPop=4.0,musCount=4.25,fly=5.4,drop=5.6,
        zoomOut=9.2,engRise=10.0,engCount=10.9,engMus=12.4,engMusCount=12.65,engFly=13.8,engDrop=14.0,
        toGraph=17.0,graph=17.3,plunge=18.9,toStreet=21.3,street=21.5,off=22.2,end=25.0)
def bp(x,lo,hi): return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x)
def lowp(x,f): return sosfilt(butter(2,f,fs=SR,output='sos'),x)
def hip(x,f): return sosfilt(butter(2,f,btype='high',fs=SR,output='sos'),x)
def add(sig,start,gain=1.0,pan=0.0):
    i=int(start*SR);
    if i<0: sig=sig[-i:]; i=0
    n=min(len(sig),N-i)
    if n<=0: return
    L[i:i+n]+=sig[:n]*gain*np.sqrt((1-pan)/2); R[i:i+n]+=sig[:n]*gain*np.sqrt((1+pan)/2)
mf=lambda m:440*2**((m-69)/12)
def saw(f,tt): return 2*((tt*f)%1)-1

# ---------------- MUSIC: cinematic minor, 100 bpm
bpm=100; beat=60/bpm; bar=beat*4
chords=[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]]   # Am F C G
pad=np.zeros(N)
for k in range(int(D/(bar*2))+2):
    ch=chords[k%4]; s=int(k*bar*2*SR); e=min(N,int((k+1)*bar*2*SR)+SR//3)
    if s>=N: break
    tt=t[s:e]-t[s]
    seg=sum(saw(mf(m),tt)+saw(mf(m)*1.005,tt)+0.6*np.sin(2*np.pi*mf(m-12)*tt) for m in ch)/10
    env=np.minimum(1,tt/0.5)*np.minimum(1,(e/SR-t[s:e])/0.4)
    pad[s:e]+=seg*env
# filter sweeps open during scenes; darker in the deserted street
cut=np.interp(t,[0,2,9,10,17,18,21.3,22,25],[500,1400,1800,900,2200,2600,1200,600,400])
padf=np.zeros(N); blk=2400
for i in range(0,N,blk):
    padf[i:i+blk]=lowp(pad[max(0,i-blk*4):i+blk],cut[i])[-len(pad[i:i+blk]):]
pad=padf*0.32
# arpeggio (pluck) on 8ths
arp=np.zeros(N)
b=1.2;i=0
while b<TL['off']+0.3:
    k=int(b/(bar*2))%4; ch=chords[k]; m=ch[[0,2,4,3,1,2,4,2][i%8]]+12
    n=int(0.35*SR); tt=np.arange(n)/SR
    note=(np.sin(2*np.pi*mf(m)*tt)+0.3*np.sin(2*np.pi*mf(m)*2*tt))*np.exp(-tt*9)
    add(note,b,0.10,pan=0.35 if i%2 else -0.35); b+=beat/2; i+=1
# sub bass on roots
for k in range(int(D/(bar*2))+1):
    st=k*bar*2
    if st>TL['off']+1.5: break
    n=int(bar*2*SR); tt=np.arange(n)/SR
    add(np.sin(2*np.pi*mf(chords[k%4][0]-12)*tt)*np.minimum(1,tt/0.05)*np.exp(-tt*0.4),st,0.22)
# drums: kick + hats, sparse intro, full in middle, stop in street
kl=int(0.4*SR); kt=np.arange(kl)/SR
kick=np.sin(2*np.pi*(42+90*np.exp(-kt*28))*kt)*np.exp(-kt*8)
hh_n=int(0.06*SR); hht=np.arange(hh_n)/SR
def hat(): return hip(rng.standard_normal(hh_n),7000)*np.exp(-hht*70)
def snare():
    n=int(0.3*SR); tt=np.arange(n)/SR
    return bp(rng.standard_normal(n),1500,7000)*np.exp(-tt*14)*0.8+np.sin(2*np.pi*190*tt)*np.exp(-tt*20)*0.5
b=1.9;i=0
while b<TL['toStreet']-0.1:
    quiet= (TL['zoomOut']-0.3<b<TL['engRise']+0.3) or (TL['toGraph']-0.2<b<TL['graph']+0.3)
    if not quiet:
        if i%4 in(0,) or (i%4==2 and b>4): add(kick,b,0.55)
        if i%4==2 and b>5.5: add(snare(),b,0.22)
        add(hat(),b+beat/2,0.07,pan=0.3)
        if b>4: add(hat(),b,0.04,pan=-0.3)
    b+=beat;i+=1
L+=pad;R+=pad
# ---------------- SFX
def whoosh(dur=0.9):
    n=int(dur*SR);tt=np.arange(n)/SR;x=rng.standard_normal(n)
    out=np.zeros(n);c=1024
    for j in range(0,n,c):
        f=400+3500*(j/n); out[j:j+c]=bp(x[max(0,j-4096):j+c],f*0.6,min(f*1.6,20000))[-len(x[j:j+c]):]
    return out*np.sin(np.pi*tt/dur)**2*0.6
def impact(g=1.0):
    n=int(1.8*SR);tt=np.arange(n)/SR
    boom=np.sin(2*np.pi*(36+70*np.exp(-tt*10))*tt)*np.exp(-tt*2.6)
    crack=lowp(rng.standard_normal(n),3000)*np.exp(-tt*16)*0.5
    return (boom+crack)*g
def riser(dur):
    n=int(dur*SR);tt=np.arange(n)/SR
    tone=np.sin(2*np.pi*np.cumsum(200+900*(tt/dur)**2)/SR)*0.25
    return (bp(rng.standard_normal(n),800,7000)*0.4+tone)*(tt/dur)**2*0.6
def pop():
    n=int(0.25*SR);tt=np.arange(n)/SR
    f=np.cumsum(500+900*np.exp(-tt*25))/SR
    return np.sin(2*np.pi*f)*np.exp(-tt*18)*0.5+bp(rng.standard_normal(n),2000,8000)*np.exp(-tt*60)*0.3
def ding(f=1320):
    n=int(0.8*SR);tt=np.arange(n)/SR
    return (np.sin(2*np.pi*f*tt)+0.4*np.sin(2*np.pi*f*1.5*tt)+0.2*np.sin(2*np.pi*f*2*tt))*np.exp(-tt*6)*0.25
def ticks(dur,rate=0.045):
    n=int(dur*SR);out=np.zeros(n)
    for k in np.arange(0,dur,rate):
        i=int(k*SR);m=min(360,n-i);out[i:i+m]+=np.sin(2*np.pi*2600*np.arange(m)/SR)*np.exp(-np.arange(m)/SR*320)*0.13
    return out
def fall(dur):   # descending tone for "population drop"
    n=int(dur*SR);tt=np.arange(n)/SR
    f=np.cumsum(900*np.exp(-tt*1.6)+80)/SR
    return (saw(1,f)*0.3+np.sin(2*np.pi*f)*0.6)*np.minimum(1,tt/0.05)*np.exp(-tt*0.9)*0.35
def sparkle(dur):  # dots flying up
    n=int(dur*SR);out=np.zeros(n)
    for k in range(40):
        i=int(rng.uniform(0,dur-0.2)*SR);m=int(0.15*SR);tt=np.arange(m)/SR;f=rng.uniform(1800,4200)
        out[i:i+m]+=np.sin(2*np.pi*f*tt)*np.exp(-tt*30)*0.08
    return out
def shutter():
    n=int(0.7*SR);tt=np.arange(n)/SR
    rat=(np.sin(2*np.pi*38*tt)>0.6).astype(float)
    return bp(rng.standard_normal(n),600,4000)*rat*np.exp(-tt*2)*0.35+np.sin(2*np.pi*70*tt)*np.exp(-(tt-0.62).clip(0)*30)*(tt>0.6)*0.6
def click():
    n=int(0.05*SR);tt=np.arange(n)/SR
    return hip(rng.standard_normal(n),3000)*np.exp(-tt*120)*0.5
# intro
add(riser(1.2),0.0,0.6); add(impact(0.9),0.5)
add(whoosh(0.7),TL['lonRise'],0.6)
add(pop(),TL['lonPin'],0.9); add(pop(),TL['lonPin']+0.1,0.7,-0.4)
add(pop(),TL['lonCount'],0.7,0.3); add(ticks(1.5),TL['lonCount'],1.0); add(ding(),TL['lonCount']+1.5,1.0)
add(pop(),TL['musPop'],1.0); add(ding(1568),TL['musPop']+0.05,0.8); add(ticks(1.0),TL['musCount'],0.9)
add(sparkle(1.8),TL['fly'],1.0,0.2); add(fall(2.0),TL['drop'],1.0); add(ticks(1.8,0.06),TL['drop'],0.8)
add(impact(0.8),TL['drop']+1.85)
# zoom out transition
add(riser(1.0),TL['zoomOut']-1.0,0.8); add(whoosh(1.2),TL['zoomOut']-0.1,1.0); add(impact(1.0),TL['zoomOut']+0.55)
add(pop(),TL['engRise']+0.3,0.9); add(pop(),TL['engCount'],0.7,0.3); add(ticks(1.5),TL['engCount'],1.0); add(ding(),TL['engCount']+1.5,1.0)
add(pop(),TL['engMus'],1.0); add(ding(1568),TL['engMus']+0.05,0.8); add(ticks(1.0),TL['engMusCount'],0.9)
add(sparkle(1.8),TL['engFly'],1.0,-0.2); add(fall(2.0),TL['engDrop'],1.0); add(ticks(1.8,0.06),TL['engDrop'],0.8)
add(impact(0.85),TL['engDrop']+1.85)
# graph
add(riser(0.9),TL['toGraph']-0.6,0.8); add(whoosh(0.9),TL['toGraph'],1.0); add(impact(0.9),TL['toGraph']+0.35)
add(pop(),TL['graph']+0.3,0.7); add(pop(),TL['plunge'],0.9)
add(fall(2.2),TL['plunge'],1.3); add(impact(1.1),TL['plunge']+1.6)
# street
add(whoosh(0.9),TL['toStreet']-0.05,1.0); add(impact(0.8),TL['toStreet']+0.3)
for i in range(6):
    add(click(),TL['off']+i*0.28,0.8,-0.6+i*0.24); add(shutter(),TL['off']+0.1+i*0.28,0.55,-0.6+i*0.24); add(pop(),TL['off']+0.2+i*0.28,0.45,-0.6+i*0.24)
for i in range(4): add(click(),TL['off']+0.45+i*0.35,0.7)
# wind for emptiness
n=int((D-TL['off'])*SR);tt=np.arange(n)/SR
wind=bp(rng.standard_normal(n),250,1200)*(0.6+0.4*np.sin(2*np.pi*0.3*tt))*np.minimum(1,tt/1.0)
add(wind,TL['off'],0.25,0.2)
# final low drone note
n=int(3.2*SR);tt=np.arange(n)/SR
add((np.sin(2*np.pi*mf(33)*tt)+0.5*np.sin(2*np.pi*mf(45)*tt)+0.3*np.sin(2*np.pi*mf(52)*tt))*np.minimum(1,tt/0.3)*np.exp(-tt*0.5),TL['off']-0.1,0.35)
add(impact(1.0),TL['end']-2.2)
mix=np.stack([L,R],1)
# fades
mix*=np.minimum(1,t/0.15)[:,None]*np.clip((D-t)/1.0,0,1)[:,None]
mix=np.tanh(mix/np.max(np.abs(mix))*1.4)/np.tanh(1.4)*0.89
pcm=(mix*32767).astype(np.int16)
with wave.open('music.wav','wb') as wf:
    wf.setnchannels(2);wf.setsampwidth(2);wf.setframerate(SR);wf.writeframes(pcm.tobytes())
print('ok',mix.shape)
