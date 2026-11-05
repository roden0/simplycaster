//! Delivery conversion to FLAC (CU10, ADR-0001), the only audio processing in the Coordinator.
//! Each Track part is resampled so it lasts what the Coordinator clock says (ADR-0004).

use std::path::{Path, PathBuf};

use tokio::process::Command;

/// Opus always decodes at 48 kHz, whatever rate the browser recorded at.
const OPUS_RATE: u32 = 48_000;
/// `asetrate` only takes whole Hz: relabelling at 20 × 48 kHz gives ~1 ppm steps.
const UPSAMPLE: u32 = 20;

/// One Track part to convert: the Ogg, where the FLAC goes, and its audio clock drift.
pub struct Job {
    pub ogg: PathBuf,
    pub flac: PathBuf,
    pub drift_ppm: Option<f64>,
}

/// FFmpeg audio filter that removes `ppm` of drift: a clock running fast recorded too many
/// samples, so the part is shortened by 1 / (1 + ppm·10⁻⁶).
fn drift_filter(ppm: f64) -> String {
    let high = OPUS_RATE * UPSAMPLE;
    let relabel = (f64::from(high) * (1.0 + ppm / 1e6)).round();
    format!("aresample={high}:resampler=soxr,asetrate={relabel},aresample={OPUS_RATE}:resampler=soxr")
}

async fn convert(job: &Job) -> Result<(), String> {
    // Written aside and renamed when done, so a FLAC on disk is always complete.
    let part = job.flac.with_extension("flac.part");
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-nostdin", "-v", "error", "-y", "-i"]).arg(&job.ogg);
    if let Some(ppm) = job.drift_ppm {
        cmd.args(["-af", &drift_filter(ppm)]);
    }
    let out = cmd
        .args(["-c:a", "flac", "-f", "flac"])
        .arg(&part)
        .output()
        .await
        .map_err(|e| format!("cannot run ffmpeg: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    tokio::fs::rename(&part, &job.flac).await.map_err(|e| e.to_string())
}

/// Converts every part, one at a time; stops at the first failure.
pub async fn convert_all(jobs: Vec<Job>) -> Result<(), String> {
    if let Some(dir) = jobs.first().and_then(|j| j.flac.parent()) {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    for job in &jobs {
        convert(job)
            .await
            .map_err(|e| format!("{}: {e}", job.ogg.display()))?;
    }
    Ok(())
}

/// Where the FLAC of a Track part goes: `flac/<stem>.flac` inside the Room folder.
pub fn path(room_dir: &Path, stem: &str) -> PathBuf {
    room_dir.join("flac").join(format!("{stem}.flac"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drift_filter_relabels_in_ppm_steps() {
        assert_eq!(
            drift_filter(30.0),
            "aresample=960000:resampler=soxr,asetrate=960029,aresample=48000:resampler=soxr"
        );
        assert!(drift_filter(-58.7).contains("asetrate=959944,"));
    }
}
