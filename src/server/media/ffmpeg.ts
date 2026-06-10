/**
 * ffmpeg/ffprobe helpers: probe metadata, transcode to a web-friendly stream,
 * and compute normalized waveform peaks by streaming raw PCM (no audiowaveform
 * dependency). All run in the worker process.
 */
import { spawn } from "node:child_process";

function run(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Startup self-check: confirm the media binaries are present and runnable.
 * Called by the worker on boot so a misbuilt image fails loudly and early
 * rather than on the first job. (We use ffmpeg for peaks instead of BBC
 * audiowaveform, so only ffmpeg/ffprobe are required.)
 */
export async function assertMediaTools(): Promise<void> {
  const tools = ["ffmpeg", "ffprobe"] as const;
  for (const tool of tools) {
    try {
      const { stdout, stderr } = await run(tool, ["-version"]);
      const firstLine = (stdout || stderr).split("\n", 1)[0];
      console.log(`[media] ${firstLine}`);
    } catch (err) {
      throw new Error(
        `Required media tool "${tool}" is missing or not runnable: ${
          (err as Error).message
        }`,
      );
    }
  }
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string | number;
  channels?: number;
  disposition?: { attached_pic?: number };
}

export interface ProbeResult {
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  // A real video stream (not embedded cover art) is present.
  hasVideo: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

export async function probe(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ]);
  const json = JSON.parse(stdout);
  const streams: ProbeStream[] = json.streams ?? [];
  const audio = streams.find((s) => s.codec_type === "audio");
  // Ignore "video" streams that are really attached cover art (e.g. mp3 art).
  const video = streams.find(
    (s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1,
  );
  const duration = parseFloat(json.format?.duration);
  return {
    durationSeconds: Number.isFinite(duration) ? duration : null,
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null,
    channels: audio?.channels ? Number(audio.channels) : null,
    hasVideo: Boolean(video),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  };
}

/**
 * Produce a web-playable MP4 from a video upload. If the source is already
 * H.264 video + AAC audio we just remux to a faststart MP4 (fast, no re-encode);
 * otherwise we transcode to H.264/AAC, capped at 1280px wide.
 */
export async function transcodeToVideo(
  inputPath: string,
  outputPath: string,
  codecs: { videoCodec: string | null; audioCodec: string | null },
) {
  const canRemux =
    codecs.videoCodec === "h264" &&
    (codecs.audioCodec === "aac" || codecs.audioCodec === null);

  const args = canRemux
    ? [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ]
    : [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        // Downscale to <=1280px wide, keep aspect, even height. Comma escaped.
        "scale=min(1280\\,iw):-2",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ];

  await run("ffmpeg", args);
}

/** Transcode to AAC in an MP4 container with the moov atom up front (seekable). */
export async function transcodeToStream(inputPath: string, outputPath: string) {
  await run("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

const PEAK_RATE = 8000; // Hz to decode at for peak analysis
const POINTS_PER_SECOND = 20;
const MIN_POINTS = 32;
const MAX_POINTS = 12000;

export interface PeaksResult {
  version: number;
  sampleRate: number;
  length: number;
  // Normalized to -1..1 (single max-abs value per bucket; wavesurfer mirrors it).
  data: number[];
}

/**
 * Streams mono 16-bit PCM out of ffmpeg and reduces it to a bounded array of
 * normalized peak amplitudes, without buffering the whole decoded signal.
 */
export function generatePeaks(
  inputPath: string,
  durationSeconds: number,
): Promise<PeaksResult> {
  const estimatedSamples = Math.max(1, Math.round(durationSeconds * PEAK_RATE));
  const targetPoints = Math.min(
    MAX_POINTS,
    Math.max(MIN_POINTS, Math.round(durationSeconds * POINTS_PER_SECOND)),
  );
  const samplesPerBucket = Math.max(
    1,
    Math.floor(estimatedSamples / targetPoints),
  );

  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-v",
      "quiet",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(PEAK_RATE),
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "-",
    ]);

    const peaks: number[] = [];
    let bucketMax = 0;
    let bucketCount = 0;
    let leftover: Buffer | null = null;

    child.stdout.on("data", (chunk: Buffer) => {
      let buf = chunk;
      if (leftover) {
        buf = Buffer.concat([leftover, chunk]);
        leftover = null;
      }
      const usableLen = buf.length - (buf.length % 2);
      if (usableLen < buf.length) leftover = buf.subarray(usableLen);

      for (let i = 0; i < usableLen; i += 2) {
        const sample = buf.readInt16LE(i);
        const abs = sample < 0 ? -sample : sample;
        if (abs > bucketMax) bucketMax = abs;
        if (++bucketCount >= samplesPerBucket) {
          peaks.push(bucketMax / 32768);
          bucketMax = 0;
          bucketCount = 0;
        }
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg peaks exited ${code}`));
        return;
      }
      if (bucketCount > 0) peaks.push(bucketMax / 32768);
      resolve({
        version: 1,
        sampleRate: PEAK_RATE,
        length: peaks.length,
        data: peaks,
      });
    });
  });
}
