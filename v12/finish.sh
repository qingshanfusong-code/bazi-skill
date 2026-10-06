#!/bin/bash
# concat rendered parts + master the soundtrack + mux → out/V12_极致的燃烧_1080p60.mp4
set -e
cd "$(dirname "$0")"
printf "file 'part1.mp4'\nfile 'part2.mp4'\n" > out/parts.txt
ffmpeg -v error -y -f concat -safe 0 -i out/parts.txt -c copy out/video.mp4
ffmpeg -v error -y -i out/soundtrack.wav -af "acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=2,loudnorm=I=-12:TP=-1.0:LRA=9,aresample=48000" -c:a pcm_s16le out/master.wav
ffmpeg -v error -y -i out/video.mp4 -i out/master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "out/V12_极致的燃烧_1080p60.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "out/V12_极致的燃烧_1080p60.mp4"
