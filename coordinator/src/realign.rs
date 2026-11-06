//! Realigning a Participant's Track of a Take for the FLAC delivery (ADR-0010): where audio went missing,
//! the audio clock drift across those losses, and where each stretch of each part goes on the Take's
//! timeline. Pure: `flac.rs` runs the plan through FFmpeg.

use serde::{Deserialize, Serialize};

use crate::tus::DriftMark;

/// Less than this between two drift marks is measurement noise (±0.4 ms) or drift (tens of ppm).
pub const MIN_GAP_MS: f64 = 10.0;
/// Drift marks must span this long before their slope is trusted to correct a part (ADR-0004).
const MIN_DRIFT_SPAN_MS: f64 = 60_000.0;
/// Beyond this the marks are wrong, not the clock: real audio clocks drift tens of ppm.
const MAX_DRIFT_PPM: f64 = 1000.0;
/// Opus always decodes at 48 kHz, whatever rate the browser recorded at.
pub const OPUS_RATE: u32 = 48_000;

/// Audio that went missing, or extra audio when `ms` is negative, between two drift marks.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gap {
    /// Where in the part's recorded audio (ms from its start): the middle of the interval.
    pub at_ms: f64,
    /// Coordinator time minus audio received over the interval. Positive: filled with silence.
    pub ms: f64,
}

#[derive(Debug, PartialEq)]
pub struct Analysis {
    pub drift_ppm: Option<f64>,
    pub gaps: Vec<Gap>,
}

/// The gaps of a part and its drift, fitted with one slope across the stretches between gaps, each
/// stretch with its own offset; `None` when the marks are too few or too short to trust.
pub fn analyse(marks: &[DriftMark], sample_rate: u32) -> Analysis {
    // (Coordinator time, audio received), both in ms.
    let points: Vec<(f64, f64)> = marks
        .iter()
        .map(|m| (m.coordinator_time, m.samples as f64 * 1000.0 / f64::from(sample_rate)))
        .collect();
    let mut gaps = Vec::new();
    let mut stretches: Vec<&[(f64, f64)]> = Vec::new();
    let mut start = 0;
    for i in 1..points.len() {
        let (x0, y0) = points[i - 1];
        let (x1, y1) = points[i];
        let missing = (x1 - x0) - (y1 - y0);
        if missing.abs() > MIN_GAP_MS {
            gaps.push(Gap {
                at_ms: (y0 + y1) / 2.0,
                ms: missing,
            });
            stretches.push(&points[start..i]);
            start = i;
        }
    }
    stretches.push(&points[start..]);

    let (mut sxy, mut sxx, mut span, mut n) = (0.0, 0.0, 0.0, 0);
    for s in stretches.iter().filter(|s| s.len() >= 2) {
        let len = s.len() as f64;
        let (mx, my) = (
            s.iter().map(|p| p.0).sum::<f64>() / len,
            s.iter().map(|p| p.1).sum::<f64>() / len,
        );
        sxy += s.iter().map(|(x, y)| (x - mx) * (y - my)).sum::<f64>();
        sxx += s.iter().map(|(x, _)| (x - mx).powi(2)).sum::<f64>();
        span += s[s.len() - 1].0 - s[0].0;
        n += s.len();
    }
    let drift_ppm = (n >= 3 && span >= MIN_DRIFT_SPAN_MS && sxx > 0.0)
        .then(|| (sxy / sxx - 1.0) * 1e6)
        .filter(|ppm| ppm.abs() < MAX_DRIFT_PPM);
    Analysis { drift_ppm, gaps }
}

/// A Track part as the plan needs it.
pub struct Part {
    /// When its first sample was recorded, relative to T (ms).
    pub start_offset_ms: f64,
    /// Audio it holds (ms); `None` when unreadable, then it is taken to run to the end of the Take.
    pub duration_ms: Option<f64>,
    pub drift_ppm: Option<f64>,
    pub gaps: Vec<Gap>,
}

/// One stretch of a part on the Take's timeline. `from_ms`/`to_ms` are in the part after drift correction.
#[derive(Debug, PartialEq)]
pub struct Piece {
    pub part: usize,
    pub from_ms: f64,
    pub to_ms: f64,
    pub at_ms: f64,
}

/// Where each stretch of each part goes, from T to `take_ms`: parts in order, split at their gaps and
/// pushed later by the silence of each one. Where a part overlaps the one before, the earlier part
/// wins and the start of the later one is dropped. Nothing goes before T or after `take_ms`.
pub fn plan(parts: &[Part], take_ms: f64) -> Vec<Piece> {
    let mut order: Vec<usize> = (0..parts.len()).collect();
    order.sort_by(|a, b| parts[*a].start_offset_ms.total_cmp(&parts[*b].start_offset_ms));
    let mut pieces = Vec::new();
    let mut end = 0.0_f64; // the timeline is taken up to here
    for i in order {
        let p = &parts[i];
        let corrected = 1.0 / (1.0 + p.drift_ppm.unwrap_or(0.0) / 1e6);
        let duration = p.duration_ms.unwrap_or(take_ms - p.start_offset_ms.max(0.0)).max(0.0);
        let mut cuts: Vec<&Gap> = p
            .gaps
            .iter()
            .filter(|g| g.ms > 0.0 && g.at_ms > 0.0 && g.at_ms < duration)
            .collect();
        cuts.sort_by(|a, b| a.at_ms.total_cmp(&b.at_ms));
        let (mut from, mut silence) = (0.0, 0.0);
        for (to, gap) in cuts.iter().map(|g| (g.at_ms, g.ms)).chain([(duration, 0.0)]) {
            let mut piece = Piece {
                part: i,
                from_ms: from * corrected,
                to_ms: to * corrected,
                at_ms: p.start_offset_ms + from * corrected + silence,
            };
            let skip = end - piece.at_ms;
            if skip > 0.0 {
                piece.from_ms += skip;
                piece.at_ms = end;
            }
            let room = take_ms - piece.at_ms;
            piece.to_ms = piece.to_ms.min(piece.from_ms + room);
            if piece.to_ms > piece.from_ms {
                end = piece.at_ms + (piece.to_ms - piece.from_ms);
                pieces.push(piece);
            }
            from = to;
            silence += gap;
        }
    }
    pieces
}

/// FFmpeg audio filter that removes `ppm` of drift: a clock running fast recorded too many samples, so
/// the part is shortened by 1 / (1 + ppm·10⁻⁶). `asetrate` only takes whole Hz: relabelling at
/// 20 × 48 kHz gives ~1 ppm steps.
pub fn drift_filter(ppm: f64) -> String {
    let high = OPUS_RATE * 20;
    let relabel = (f64::from(high) * (1.0 + ppm / 1e6)).round();
    format!("aresample={high}:resampler=soxr,asetrate={relabel},aresample={OPUS_RATE}:resampler=soxr")
}

/// The `-filter_complex` that builds the Track from the parts given as inputs 0, 1…: each part corrected
/// for drift, cut into its pieces, each piece delayed to its place, mixed (they never overlap) and
/// padded with silence to `take_ms`. Output label `[out]`.
pub fn filter_graph(drift: &[Option<f64>], pieces: &[Piece], take_ms: f64) -> String {
    let secs = |ms: f64| format!("{:.6}", ms.max(0.0) / 1000.0);
    let end = secs(take_ms);
    if pieces.is_empty() {
        return format!("anullsrc=r={OPUS_RATE}:cl=mono,atrim=end={end}[out]");
    }
    let mut graph = Vec::new();
    for (i, ppm) in drift.iter().enumerate() {
        let mine: Vec<usize> = (0..pieces.len()).filter(|j| pieces[*j].part == i).collect();
        if mine.is_empty() {
            continue;
        }
        let correct = ppm.map(drift_filter).unwrap_or_else(|| "anull".into());
        let outs: String = mine.iter().map(|j| format!("[s{j}]")).collect();
        graph.push(format!(
            "[{i}:a]{correct},aresample={OPUS_RATE},asplit={}{outs}",
            mine.len()
        ));
    }
    for (j, p) in pieces.iter().enumerate() {
        let delay = (p.at_ms * f64::from(OPUS_RATE) / 1000.0).round() as u64;
        graph.push(format!(
            "[s{j}]atrim=start={}:end={},asetpts=PTS-STARTPTS,adelay=delays={delay}S:all=1[p{j}]",
            secs(p.from_ms),
            secs(p.to_ms)
        ));
    }
    let ins: String = (0..pieces.len()).map(|j| format!("[p{j}]")).collect();
    graph.push(format!(
        // amix leaves timestamps that make apad stop short; renumbering them is safe because adelay
        // fills every piece with silence from 0, so the mix is continuous.
        "{ins}amix=inputs={}:normalize=0:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur={end},atrim=end={end}[out]",
        pieces.len()
    ));
    graph.join(";")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Marks every 2 s for `seconds`, with `ppm` of drift, ±20 samples of jitter, and `lost` samples
    /// missing from the mark at `lost_at` s on.
    fn marks(seconds: u32, ppm: f64, lost_at: u32, lost: u64) -> Vec<DriftMark> {
        (0..=seconds / 2)
            .map(|i| {
                let t = f64::from(i * 2);
                let jitter = if i % 2 == 0 { 20.0 } else { -20.0 };
                let mut samples = (t * 48_000.0 * (1.0 + ppm / 1e6) + jitter) as u64;
                if i * 2 >= lost_at {
                    samples -= lost;
                }
                DriftMark {
                    samples,
                    coordinator_time: 1e12 + t * 1000.0,
                    clock_offset_ms: 0.0,
                    clock_rtt_ms: 40.0,
                }
            })
            .collect()
    }

    #[test]
    fn a_clean_part_has_its_drift_and_no_gaps() {
        let a = analyse(&marks(600, 30.0, u32::MAX, 0), 48_000);
        assert!((a.drift_ppm.unwrap() - 30.0).abs() < 0.5, "{a:?}");
        assert!(a.gaps.is_empty());
    }

    #[test]
    fn a_loss_becomes_a_gap_and_keeps_the_drift() {
        // 276 ms (13 248 samples) lost between the marks at 160 and 162 s, as in Room pruebalogin.
        let a = analyse(&marks(300, 30.0, 162, 13_248), 48_000);
        assert_eq!(a.gaps.len(), 1);
        assert!((a.gaps[0].ms - 276.0).abs() < 1.0, "{a:?}");
        // The middle of the audio received over that interval: 160 000 ms plus half of 2 000 − 276.
        assert!((a.gaps[0].at_ms - 160_862.0).abs() < 10.0, "{a:?}");
        assert!((a.drift_ppm.unwrap() - 30.0).abs() < 1.0, "{a:?}");
    }

    #[test]
    fn extra_audio_is_noted_with_a_negative_gap() {
        let mut m = marks(120, 0.0, u32::MAX, 0);
        for mark in &mut m[30..] {
            mark.samples += 960; // 20 ms more than the clock allows
        }
        let a = analyse(&m, 48_000);
        assert_eq!(a.gaps.len(), 1);
        assert!((a.gaps[0].ms + 20.0).abs() < 1.0, "{a:?}");
    }

    #[test]
    fn too_few_or_absurd_marks_are_not_trusted() {
        assert_eq!(analyse(&marks(20, 0.0, u32::MAX, 0), 48_000).drift_ppm, None);
        assert_eq!(analyse(&marks(600, 5000.0, u32::MAX, 0), 48_000).drift_ppm, None);
    }

    fn part(start: f64, duration: f64, gaps: &[(f64, f64)]) -> Part {
        Part {
            start_offset_ms: start,
            duration_ms: Some(duration),
            drift_ppm: None,
            gaps: gaps.iter().map(|&(at_ms, ms)| Gap { at_ms, ms }).collect(),
        }
    }

    #[test]
    fn a_gap_splits_a_part_and_pushes_the_rest_later() {
        let pieces = plan(&[part(0.0, 10_000.0, &[(4_000.0, 300.0), (6_000.0, -5.0)])], 10_300.0);
        assert_eq!(
            pieces,
            [
                Piece {
                    part: 0,
                    from_ms: 0.0,
                    to_ms: 4_000.0,
                    at_ms: 0.0
                },
                Piece {
                    part: 0,
                    from_ms: 4_000.0,
                    to_ms: 10_000.0,
                    at_ms: 4_300.0
                },
            ]
        );
    }

    #[test]
    fn parts_go_in_their_place_and_the_earlier_wins_an_overlap() {
        // Part 2 (index 0 here) seems to start 20 ms before part 1 ends: its first 20 ms go.
        let pieces = plan(&[part(5_980.0, 3_000.0, &[]), part(0.0, 6_000.0, &[])], 9_000.0);
        assert_eq!(
            pieces,
            [
                Piece {
                    part: 1,
                    from_ms: 0.0,
                    to_ms: 6_000.0,
                    at_ms: 0.0
                },
                Piece {
                    part: 0,
                    from_ms: 20.0,
                    to_ms: 3_000.0,
                    at_ms: 6_000.0
                },
            ]
        );
    }

    #[test]
    fn nothing_goes_past_the_end_of_the_take() {
        let pieces = plan(&[part(0.0, 5_000.0, &[(1_000.0, 2_000.0)])], 4_000.0);
        assert_eq!(pieces.last().unwrap().to_ms, 2_000.0);
        assert_eq!(pieces.last().unwrap().at_ms, 3_000.0);
    }

    #[test]
    fn drift_correction_shortens_the_stretches() {
        let mut p = part(0.0, 1_000_000.0, &[]);
        p.drift_ppm = Some(1_000.0 - 1e-9); // just under the limit, for round numbers
        let piece = &plan(&[p], 2_000_000.0)[0];
        assert!((piece.to_ms - 999_000.999).abs() < 0.01, "{piece:?}");
    }

    #[test]
    fn the_graph_places_each_piece_and_pads_to_the_take() {
        let pieces = plan(&[part(0.0, 3_000.0, &[]), part(4_000.0, 2_000.0, &[])], 7_000.0);
        let graph = filter_graph(&[Some(30.0), None], &pieces, 7_000.0);
        assert_eq!(
            graph,
            "[0:a]aresample=960000:resampler=soxr,asetrate=960029,aresample=48000:resampler=soxr,aresample=48000,asplit=1[s0];\
             [1:a]anull,aresample=48000,asplit=1[s1];\
             [s0]atrim=start=0.000000:end=3.000000,asetpts=PTS-STARTPTS,adelay=delays=0S:all=1[p0];\
             [s1]atrim=start=0.000000:end=2.000000,asetpts=PTS-STARTPTS,adelay=delays=192000S:all=1[p1];\
             [p0][p1]amix=inputs=2:normalize=0:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=7.000000,atrim=end=7.000000[out]"
        );
    }
}
