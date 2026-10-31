import numpy as np, subprocess, json, sys
SR=48000
raw=subprocess.run(['ffmpeg','-v','error','-i','vo1.mp3','-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
x=np.frombuffer(raw,np.float32).copy()
# silence detection by RMS in 10ms windows
win=480; n=len(x)//win
rms=np.sqrt((x[:n*win].reshape(n,win)**2).mean(1)+1e-12)
db=20*np.log10(rms)
sil=db<-38
# find runs
runs=[];i=0
while i<n:
    if sil[i]:
        j=i
        while j<n and sil[j]: j+=1
        runs.append((i*win,j*win)); i=j
    else: i+=1
KEEP=int(0.14*SR)
segs=[];cur=0;mapping=[]  # mapping list of (orig_start, new_start, length)
out=[];newpos=0
for a,b in runs:
    if b-a<=KEEP: continue
    # keep audio cur..a+KEEP/2, skip to b-KEEP/2
    a2=a+KEEP//2; b2=b-KEEP//2
    if a==0: a2=0; b2=b-int(0.03*SR)
    out.append(x[cur:a2]); mapping.append((cur,newpos,a2-cur)); newpos+=a2-cur; cur=b2
out.append(x[cur:]); mapping.append((cur,newpos,len(x)-cur)); newpos+=len(x)-cur
y=np.concatenate(out)
# short crossfades are avoided since cuts happen inside silence
L=len(y)/SR
TARGET=63.2; LEAD=0.35
tempo=L/TARGET
print('compressed',L,'tempo',tempo,file=sys.stderr)
y.astype(np.float32).tofile('vo_cut.f32')
def m(t):
    s=int(t*SR)
    for o,nw,l in mapping:
        if o<=s<o+l: return LEAD+(nw+(s-o))/SR/tempo
        if s<o: return LEAD+nw/SR/tempo
    return LEAD+newpos/SR/tempo
keys={'q':0.12,'s2':8.86,'p_in':18.48,'p_pk':23.32,'s3':25.1,'t_in':28.58,'t_pk':32.14,'s4':34.82,'a_in':37.2,'a_pk':40.6,'a_but':42.64,'a_train':46.86,'a_tech':47.66,'a_strat':48.62,'a_def':49.94,
's5':52.28,'n_car':54.1,'n_sub':55.78,'n_pkcar':58.78,'n_pksub':61.22,'s6':62.74,'c_lhr':64.1,'c_skt':64.86,'c_khi':65.72,'c_more':66.52,'c_nopred':70.14,
's7':74.42,'k_nuke':76.68,'k_war':79.28,'k_loss':81.66,'k_q':84.48,'end':85.42}
T={k:round(m(v),3) for k,v in keys.items()}
json.dump({'tempo':tempo,'T':T},open('timing.json','w'),indent=1)
print(T)
