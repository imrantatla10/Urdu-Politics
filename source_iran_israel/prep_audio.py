import numpy as np, subprocess, json, sys
SR=48000
raw=subprocess.run(['ffmpeg','-v','error','-i','vo1.mp3','-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
x=np.frombuffer(raw,np.float32).copy()
win=480; n=len(x)//win
db=20*np.log10(np.sqrt((x[:n*win].reshape(n,win)**2).mean(1)+1e-12))
sil=db<-38
runs=[];i=0
while i<n:
    if sil[i]:
        j=i
        while j<n and sil[j]: j+=1
        runs.append((i*win,j*win)); i=j
    else: i+=1
KEEP=int(0.16*SR)
cur=0;mapping=[];out=[];newpos=0
for a,b in runs:
    if b-a<=KEEP: continue
    a2=a+KEEP//2; b2=b-KEEP//2
    if a==0: a2=0; b2=b-int(0.03*SR)
    if b>=len(x)-win: b2=len(x)  # trailing silence dropped
    out.append(x[cur:a2]); mapping.append((cur,newpos,a2-cur)); newpos+=a2-cur; cur=b2
out.append(x[cur:]); mapping.append((cur,newpos,len(x)-cur)); newpos+=len(x)-cur
y=np.concatenate(out)
L=len(y)/SR
TARGET=63.9; LEAD=0.45
tempo=L/TARGET
print('compressed',L,'tempo',tempo,file=sys.stderr)
y.astype(np.float32).tofile('vo_cut.f32')
def m(t):
    s=int(t*SR)
    for o,nw,l in mapping:
        if o<=s<o+l: return LEAD+(nw+(s-o))/SR/tempo
        if s<o: return LEAD+nw/SR/tempo
    return LEAD+newpos/SR/tempo
keys={'q1':0.0,'q2':1.54,'q3':5.74,'q4':9.26,
's2':12.15,'ir_n':13.6,'is_n':17.36,'more':20.90,
's3':23.70,'biggest':27.10,'n2500':31.81,'unc':37.27,
's4':40.86,'inrange':45.10,
's5':47.03,
's6':53.35,'n611':56.6,'n363':59.58,
's7':63.13,'usrole':64.10,'alone':68.96,'q_end':72.13,'end':74.6}
T={k:round(m(v),3) for k,v in keys.items()}
json.dump({'tempo':tempo,'T':T},open('timing.json','w'),indent=1)
print(T)
