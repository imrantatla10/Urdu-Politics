#!/bin/bash
# usage: ./mix3d.sh voice.mp3 out.mp4   (expects work/part0..3.mp4 and work/bed3d.wav)
set -e
VO=$1; OUT=$2
TEMPO=$(python3 -c "import json;print(json.load(open('words_timing.json'))['cfg']['tempo'])")
DMS=$(python3 -c "import json;print(int(json.load(open('words_timing.json'))['cfg']['lead']*1000))")
printf "file 'part0.mp4'\nfile 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > work/parts.txt
ffmpeg -v error -y -f concat -safe 0 -i work/parts.txt -c copy work/video.mp4
ffmpeg -v error -y -i work/video.mp4 -i "$VO" -i work/bed3d.wav -filter_complex \
 "[1:a]aresample=48000,atempo=$TEMPO,adelay=$DMS|$DMS,highpass=f=70,apad=whole_dur=66,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[vo][sc];\
  [2:a]volume=0.55[bed];[bed][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[duck];\
  [vo][duck]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,aformat=channel_layouts=stereo[a]" \
 -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 26 -tune grain -pix_fmt yuv420p -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of compact "$OUT"
