//! Delivery conversion to FLAC (CU10, ADR-0001), the only audio processing in the Coordinator: one FLAC
//! per Participant and Take, from T to the end of the Take, with drift corrected (ADR-0004) and silence
//! where audio went missing (ADR-0010). `realign.rs` plans it; this runs FFmpeg.

use std::path::{Path, PathBuf};

use tokio::process::Command;

/// One Track to build: its parts as FFmpeg inputs 0, 1…, the filter graph that places them, and where
/// the FLAC goes.
pub struct Job {
    pub parts: Vec<PathBuf>,
    pub graph: String,
    pub flac: PathBuf,
}

async fn convert(job: &Job) -> Result<(), String> {
    // Written aside and renamed when done, so a FLAC on disk is always complete.
    let part = job.flac.with_extension("flac.part");
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-nostdin", "-v", "error", "-y"]);
    for ogg in &job.parts {
        cmd.arg("-i").arg(ogg);
    }
    let out = cmd
        .args([
            "-filter_complex",
            &job.graph,
            "-map",
            "[out]",
            "-c:a",
            "flac",
            "-f",
            "flac",
        ])
        .arg(&part)
        .output()
        .await
        .map_err(|e| format!("cannot run ffmpeg: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    tokio::fs::rename(&part, &job.flac).await.map_err(|e| e.to_string())
}

/// Builds every Track, one at a time; stops at the first failure.
pub async fn convert_all(jobs: Vec<Job>) -> Result<(), String> {
    if let Some(dir) = jobs.first().and_then(|j| j.flac.parent()) {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    for job in &jobs {
        convert(job).await.map_err(|e| format!("{}: {e}", job.flac.display()))?;
    }
    Ok(())
}

/// Where a Track's FLAC goes: `flac/<stem>.flac` inside the Room folder.
pub fn path(room_dir: &Path, stem: &str) -> PathBuf {
    room_dir.join("flac").join(format!("{stem}.flac"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realign::{self, Gap, Part};

    fn ffmpeg(args: &[&str]) -> bool {
        std::process::Command::new("ffmpeg")
            .args(["-nostdin", "-v", "error", "-y"])
            .args(args)
            .stdout(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    /// Mean absolute level of `flac` between `from` and `to` seconds, as 16-bit mono samples.
    fn level(flac: &Path, from: f64, to: f64) -> f64 {
        let raw = flac.with_extension("raw");
        let (ss, t) = (from.to_string(), (to - from).to_string());
        let args = [
            "-ss",
            &ss,
            "-t",
            &t,
            "-i",
            flac.to_str().unwrap(),
            "-ac",
            "1",
            "-f",
            "s16le",
        ];
        assert!(ffmpeg(&[&args[..], &[raw.to_str().unwrap()]].concat()));
        let bytes = std::fs::read(&raw).unwrap();
        let sum: f64 = bytes
            .chunks(2)
            .map(|b| f64::from(i16::from_le_bytes([b[0], b[1]]).abs()))
            .sum();
        sum / (bytes.len() / 2) as f64
    }

    /// Two parts with a gap inside the first, end to end through FFmpeg, if it is installed.
    #[tokio::test]
    async fn a_track_is_built_from_its_parts_with_silence_in_place() {
        if !ffmpeg(&["-version"]) {
            eprintln!("skipped: no ffmpeg");
            return;
        }
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let tone = |name: &str, seconds: &str| {
            let out = dir.join(name);
            let src = format!("sine=frequency=440:sample_rate=48000:duration={seconds}");
            assert!(ffmpeg(&[
                "-f",
                "lavfi",
                "-i",
                &src,
                "-c:a",
                "libopus",
                out.to_str().unwrap()
            ]));
            out
        };
        // Part 1: 3 s of tone with 0.5 s missing after its first second. Part 2: 1 s of tone at 5 s.
        let parts = [
            Part {
                start_offset_ms: 0.0,
                duration_ms: Some(3_000.0),
                drift_ppm: Some(30.0),
                gaps: vec![Gap {
                    at_ms: 1_000.0,
                    ms: 500.0,
                }],
            },
            Part {
                start_offset_ms: 5_000.0,
                duration_ms: Some(1_000.0),
                drift_ppm: None,
                gaps: vec![],
            },
        ];
        let pieces = realign::plan(&parts, 7_000.0);
        let job = Job {
            parts: vec![tone("p1.ogg", "3"), tone("p2.ogg", "1")],
            graph: realign::filter_graph(&[Some(30.0), None], &pieces, 7_000.0),
            flac: path(&dir, "t01_ana"),
        };
        convert_all(vec![job]).await.unwrap();
        let flac = path(&dir, "t01_ana");

        let probe = std::process::Command::new("ffprobe")
            .args(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"])
            .arg(&flac)
            .output()
            .unwrap();
        let seconds: f64 = String::from_utf8_lossy(&probe.stdout).trim().parse().unwrap();
        assert!((seconds - 7.0).abs() < 0.01, "{seconds}");
        // Tone, the inserted silence, tone, the silence between parts, part 2, padding to the end.
        let loud = |a, b| level(&flac, a, b) > 1000.0;
        assert!(loud(0.1, 0.9));
        assert!(!loud(1.1, 1.4));
        assert!(loud(1.6, 3.4));
        assert!(!loud(3.6, 4.9));
        assert!(loud(5.1, 5.9));
        assert!(!loud(6.1, 6.9));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
