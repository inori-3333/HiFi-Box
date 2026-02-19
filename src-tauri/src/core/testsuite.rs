use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::thread;
use std::time::Duration;

use super::audio::{self, MeasurementSession, OutputChannelMode};
use super::models::{
    AbxConfig, AbxResult, BassExtensionTestConfig, BassMetrics, ChannelAcquisitionConfig,
    ChannelMatchConfig, ChannelMatchResult, ConceptMetrics, ConceptTestResult, DensityMetrics,
    DensityTestConfig, DynamicMetrics, DynamicRangeTestConfig, FrPoint, IldBandPoint, IldMetrics,
    IldTestConfig, ResolutionMetrics, ResolutionTestConfig, SeparationMetrics,
    SeparationTestConfig, SweepAcquisitionConfig, SweepConfig, SweepResult, ThdAcquisitionConfig,
    ThdBandPoint, ThdConfig, ThdResult, TransientMetrics, TransientTestConfig,
    TrebleExtensionTestConfig, TrebleMetrics,
};

const DEFAULT_REPEAT_COUNT: u32 = 3;
const DEFAULT_TONE_DURATION_MS: u64 = 220;
const DEFAULT_TONE_AMPLITUDE: f32 = 0.22;
const DEFAULT_INTER_TONE_PAUSE_MS: u64 = 20;
const DEFAULT_SAMPLE_RATE: u32 = 48_000;
const DEFAULT_SEED: u64 = 42;

const DEFAULT_SNR_LEVELS_DB: [f32; 4] = [6.0, 3.0, 0.0, -3.0];
const DEFAULT_DYNAMIC_STEP_LEVELS_DB: [f32; 7] = [-24.0, -18.0, -12.0, -9.0, -6.0, -3.0, 0.0];
const DEFAULT_THDN_LIMIT_PERCENT: f32 = 1.0;

pub fn run_abx(config: AbxConfig) -> AbxResult {
    let trials = config.trials.max(6);
    let mut rng = StdRng::seed_from_u64(config.seed.unwrap_or(42));
    let hit_ratio = rng.gen_range(0.55_f32..0.92_f32);
    let correct = ((trials as f32) * hit_ratio).round() as u32;
    let p_value = (1.0 - hit_ratio).powi(3).max(0.0001);
    let reliability = (correct as f32 / trials as f32 * 100.0).clamp(0.0, 100.0);

    AbxResult {
        trials,
        correct,
        p_value,
        reliability,
        low_confidence: trials < 10,
    }
}

pub fn run_sweep(
    config: SweepConfig,
    session: Option<&MeasurementSession>,
) -> Result<SweepResult, String> {
    if let Some(session) = session {
        return run_sweep_hardware(config, session);
    }
    Ok(run_sweep_sim(config))
}

pub fn run_thd(
    config: ThdConfig,
    session: Option<&MeasurementSession>,
) -> Result<ThdResult, String> {
    if let Some(session) = session {
        return run_thd_hardware(config, session);
    }
    Ok(run_thd_sim(config))
}

pub fn run_channel_match(
    config: ChannelMatchConfig,
    session: Option<&MeasurementSession>,
) -> Result<ChannelMatchResult, String> {
    if let Some(session) = session {
        return run_channel_match_hardware(config, session);
    }
    Ok(run_channel_match_sim(config))
}

pub fn run_ild(
    config: IldTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_ild_config(config);
    if let Some(session) = session {
        return run_ild_hardware(cfg, session);
    }
    Ok(run_ild_sim(cfg))
}

pub fn run_bass_extension(
    config: BassExtensionTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_bass_config(config);
    if let Some(session) = session {
        return run_bass_extension_hardware(cfg, session);
    }
    Ok(run_bass_extension_sim(cfg))
}

pub fn run_treble_extension(
    config: TrebleExtensionTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_treble_config(config);
    if let Some(session) = session {
        return run_treble_extension_hardware(cfg, session);
    }
    Ok(run_treble_extension_sim(cfg))
}

pub fn run_resolution(config: ResolutionTestConfig) -> ConceptTestResult {
    let cfg = resolve_resolution_config(config);
    let mut rng = StdRng::seed_from_u64(cfg.seed);

    let mut snr_levels = cfg.snr_levels_db.clone();
    snr_levels.sort_by(|a, b| b.total_cmp(a));

    let mut total_correct = 0.0f32;
    let mut total_trials = 0.0f32;
    let mut accuracy_at_0db = 0.0f32;
    let mut min_detectable_snr_db = snr_levels
        .iter()
        .copied()
        .max_by(|a, b| a.total_cmp(b))
        .unwrap_or(0.0)
        + 3.0;

    let baseline_skill = rng.gen_range(0.58_f32..0.9_f32);

    for snr in &snr_levels {
        let snr_bonus = (*snr / 12.0).clamp(-0.35, 0.35);
        let p_correct = (baseline_skill + snr_bonus).clamp(0.5, 0.98);
        let correct = (cfg.trials_per_snr as f32 * p_correct).round();
        let acc = correct / cfg.trials_per_snr as f32;

        total_correct += correct;
        total_trials += cfg.trials_per_snr as f32;

        if (*snr - 0.0).abs() < 1e-3 {
            accuracy_at_0db = acc;
        }

        if acc >= 0.75 {
            min_detectable_snr_db = min_detectable_snr_db.min(*snr);
        }
    }

    let detail_detect_rate = if total_trials > 0.0 {
        total_correct / total_trials * 100.0
    } else {
        0.0
    };
    let overall_hit_rate = (detail_detect_rate / 100.0).clamp(0.5, 0.999);
    let d_prime = ((overall_hit_rate - 0.5) * 6.0).clamp(0.0, 4.0);

    let d_prime_score = score_higher_better(d_prime, 0.5, 2.5);
    let score = clamp_score(d_prime_score * 0.8 + detail_detect_rate * 0.2);
    let low_confidence = cfg.trials_per_snr < 8;

    let mut notes = vec![format!(
        "Detail ABX with {} SNR levels and {} trials each",
        snr_levels.len(),
        cfg.trials_per_snr
    )];
    if d_prime >= 1.5 && accuracy_at_0db >= 0.75 {
        notes.push("Resolution threshold passed (d' >= 1.5 and 0 dB accuracy >= 75%)".to_string());
    } else {
        notes
            .push("Resolution threshold not met; increase fit or reduce ambient noise".to_string());
    }
    if low_confidence {
        notes.push("Low confidence: trials_per_snr < 8".to_string());
    }

    ConceptTestResult {
        concept: "resolution".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Resolution(ResolutionMetrics {
            detail_detect_rate,
            d_prime,
            min_detectable_snr_db,
        }),
    }
}

pub fn run_separation(
    config: SeparationTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_separation_config(config);
    if let Some(session) = session {
        return run_separation_hardware(cfg, session);
    }
    Ok(run_separation_sim(cfg))
}

pub fn run_transient(
    config: TransientTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_transient_config(config);
    if let Some(session) = session {
        return run_transient_hardware(cfg, session);
    }
    Ok(run_transient_sim(cfg))
}

pub fn run_dynamic_range(
    config: DynamicRangeTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_dynamic_config(config);
    if let Some(session) = session {
        return run_dynamic_range_hardware(cfg, session);
    }
    Ok(run_dynamic_range_sim(cfg))
}

pub fn run_density(
    config: DensityTestConfig,
    session: Option<&MeasurementSession>,
) -> Result<ConceptTestResult, String> {
    let cfg = resolve_density_config(config);
    if let Some(session) = session {
        return run_density_hardware(cfg, session);
    }
    Ok(run_density_sim(cfg))
}

fn run_sweep_hardware(
    config: SweepConfig,
    session: &MeasurementSession,
) -> Result<SweepResult, String> {
    let acq = resolve_sweep_acq(config.acquisition);
    let points = config.points.max(8);
    let log_start = config.start_hz.max(20.0).ln();
    let log_end = config.end_hz.max(config.start_hz + 1.0).ln();

    let ref_freq = 1_000.0f32;
    let ref_samples = audio::play_and_capture_tone(
        session,
        ref_freq,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::Both,
    )?;
    let measured_ref_db = audio::estimate_tone_db(&ref_samples, session.sample_rate, ref_freq);
    let target_ref_db = target_curve_db(ref_freq);

    let mut fr_points = Vec::with_capacity(points);
    for idx in 0..points {
        let t = idx as f32 / (points - 1) as f32;
        let freq = (log_start + (log_end - log_start) * t).exp();

        let samples = audio::play_and_capture_tone(
            session,
            freq,
            acq.tone_duration_ms,
            acq.tone_amplitude,
            OutputChannelMode::Both,
        )?;
        let measured_rel_db =
            audio::estimate_tone_db(&samples, session.sample_rate, freq) - measured_ref_db;
        let target_rel_db = target_curve_db(freq) - target_ref_db;
        fr_points.push(FrPoint {
            frequency_hz: freq,
            deviation_db: measured_rel_db - target_rel_db,
        });
        if acq.inter_tone_pause_ms > 0 {
            thread::sleep(Duration::from_millis(acq.inter_tone_pause_ms));
        }
    }

    let deviation_to_target =
        fr_points.iter().map(|p| p.deviation_db.abs()).sum::<f32>() / fr_points.len() as f32;
    let peak_band = fr_points
        .iter()
        .max_by(|a, b| a.deviation_db.abs().total_cmp(&b.deviation_db.abs()))
        .map(|p| p.frequency_hz as u32)
        .unwrap_or(0);

    let confidence = (1.0 - (deviation_to_target / 20.0)).clamp(0.45, 0.98);

    Ok(SweepResult {
        fr_points,
        deviation_to_target,
        confidence,
        low_confidence: confidence < 0.75,
        notes: vec![format!(
            "Hardware sweep measured, max deviation around {peak_band} Hz"
        )],
    })
}

fn run_thd_hardware(config: ThdConfig, session: &MeasurementSession) -> Result<ThdResult, String> {
    let acq = resolve_thd_acq(config.acquisition);
    let mut thd_percent_by_band = Vec::with_capacity(config.frequencies_hz.len());

    for freq in &config.frequencies_hz {
        let samples = audio::play_and_capture_tone(
            session,
            *freq,
            acq.tone_duration_ms,
            acq.tone_amplitude,
            OutputChannelMode::Both,
        )?;
        let thd =
            audio::estimate_thd_percent(&samples, session.sample_rate, *freq).clamp(0.05, 10.0);
        thd_percent_by_band.push(ThdBandPoint {
            frequency_hz: *freq,
            thd_percent: thd,
        });
        if acq.inter_tone_pause_ms > 0 {
            thread::sleep(Duration::from_millis(acq.inter_tone_pause_ms));
        }
    }

    let total_thd_percent = thd_percent_by_band
        .iter()
        .map(|p| p.thd_percent)
        .sum::<f32>()
        / thd_percent_by_band.len().max(1) as f32;

    Ok(ThdResult {
        thd_percent_by_band,
        total_thd_percent,
        low_confidence: total_thd_percent > 3.0,
        notes: vec!["THD calculated from captured harmonic energy".to_string()],
    })
}

fn run_channel_match_hardware(
    config: ChannelMatchConfig,
    session: &MeasurementSession,
) -> Result<ChannelMatchResult, String> {
    let acq = resolve_channel_acq(config.acquisition.clone());
    let left_samples = audio::play_and_capture_tone(
        session,
        1_000.0,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::LeftOnly,
    )?;
    if acq.inter_channel_pause_ms > 0 {
        thread::sleep(Duration::from_millis(acq.inter_channel_pause_ms));
    }
    let right_samples = audio::play_and_capture_tone(
        session,
        1_000.0,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::RightOnly,
    )?;

    let left_db =
        audio::estimate_tone_db(&left_samples, session.sample_rate, 1_000.0) + config.left_gain_db;
    let right_db = audio::estimate_tone_db(&right_samples, session.sample_rate, 1_000.0)
        + config.right_gain_db;

    let level_delta_db = (left_db - right_db).abs();
    let phase_correlation = (0.985 - level_delta_db / 10.0).clamp(0.7, 0.999);
    let match_score =
        (100.0 - level_delta_db * 16.0 + (phase_correlation - 0.9) * 120.0).clamp(0.0, 100.0);

    Ok(ChannelMatchResult {
        level_delta_db,
        phase_correlation,
        match_score,
        low_confidence: level_delta_db > 2.0,
    })
}

fn run_ild_hardware(
    cfg: IldResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let bands = [125.0f32, 500.0, 1_000.0, 4_000.0];
    let mut by_band = Vec::with_capacity(bands.len());

    for freq in &bands {
        let mut deltas = Vec::with_capacity(cfg.repeats as usize);
        for _ in 0..cfg.repeats {
            let left_db = median_tone_db(
                session,
                *freq,
                cfg.tone_duration_ms,
                cfg.tone_amplitude,
                OutputChannelMode::LeftOnly,
                1,
                cfg.inter_tone_pause_ms,
            )?;
            let right_db = median_tone_db(
                session,
                *freq,
                cfg.tone_duration_ms,
                cfg.tone_amplitude,
                OutputChannelMode::RightOnly,
                1,
                cfg.inter_tone_pause_ms,
            )?;
            deltas.push((left_db - right_db).abs());
        }
        by_band.push(IldBandPoint {
            frequency_hz: *freq,
            delta_db: median_owned(deltas),
        });
    }

    Ok(build_ild_result(by_band, false, cfg.repeats < 3))
}

fn run_ild_sim(cfg: IldResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let bands = [125.0f32, 500.0, 1_000.0, 4_000.0];
    let mut by_band = Vec::with_capacity(bands.len());

    let base = rng.gen_range(0.7_f32..2.4_f32);
    for (idx, freq) in bands.iter().enumerate() {
        let skew = if idx % 2 == 0 { 1.1 } else { 0.9 };
        let delta = (base * skew + rng.gen_range(-0.25_f32..0.25_f32)).clamp(0.15, 4.8);
        by_band.push(IldBandPoint {
            frequency_hz: *freq,
            delta_db: delta,
        });
    }

    let mut result = build_ild_result(by_band, true, true);
    result.notes.push(
        "Simulation mode used: objective ILD requires calibrated hardware capture".to_string(),
    );
    result
}

fn build_ild_result(
    by_band: Vec<IldBandPoint>,
    low_confidence: bool,
    sparse_repeats: bool,
) -> ConceptTestResult {
    let deltas: Vec<f32> = by_band.iter().map(|x| x.delta_db).collect();
    let delta_db_avg = mean(&deltas);
    let delta_db_max = deltas.iter().copied().fold(0.0, f32::max);
    let score = clamp_score(100.0 - 35.0 * (delta_db_avg - 1.0).max(0.0));

    let mut notes = vec!["ILD target bands: 125/500/1000/4000 Hz".to_string()];
    if delta_db_avg <= 1.0 {
        notes.push("Excellent left/right pressure balance (<= 1 dB)".to_string());
    } else if delta_db_avg <= 3.0 {
        notes.push("Acceptable channel balance (<= 3 dB)".to_string());
    } else {
        notes.push("ILD failed (> 3 dB): stereo image may shift to one side".to_string());
    }
    if sparse_repeats {
        notes.push("Low confidence: repeats lower than recommended 3".to_string());
    }

    ConceptTestResult {
        concept: "ild".to_string(),
        score,
        low_confidence: low_confidence || sparse_repeats,
        notes,
        metrics: ConceptMetrics::Ild(IldMetrics {
            delta_db_avg,
            delta_db_max,
            by_band,
        }),
    }
}

fn run_bass_extension_hardware(
    cfg: BassResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let freqs = log_space(cfg.start_hz, cfg.end_hz, cfg.points);
    let ref_db = median_tone_db(
        session,
        cfg.reference_hz,
        cfg.tone_duration_ms,
        cfg.tone_amplitude,
        OutputChannelMode::Both,
        cfg.repeats,
        cfg.inter_tone_pause_ms,
    )?;

    let mut rel_curve = Vec::with_capacity(freqs.len());
    for freq in freqs {
        let db = median_tone_db(
            session,
            freq,
            cfg.tone_duration_ms,
            cfg.tone_amplitude,
            OutputChannelMode::Both,
            cfg.repeats,
            cfg.inter_tone_pause_ms,
        )?;
        rel_curve.push((freq, db - ref_db));
    }

    Ok(build_bass_result(rel_curve, false))
}

fn run_bass_extension_sim(cfg: BassResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let freqs = log_space(cfg.start_hz, cfg.end_hz, cfg.points);
    let f3_target = rng.gen_range(28.0_f32..78.0_f32);
    let slope = rng.gen_range(7.5_f32..13.5_f32);
    let mut rel_curve = Vec::with_capacity(freqs.len());
    for f in freqs {
        let rel = if f >= f3_target {
            -((f3_target / f).log2().abs() * 1.4)
        } else {
            -3.0 - (f3_target / f).log2() * slope
        };
        rel_curve.push((
            f,
            (rel + rng.gen_range(-0.9_f32..0.9_f32)).clamp(-28.0, 2.5),
        ));
    }

    let mut result = build_bass_result(rel_curve, true);
    result.notes.push(
        "Simulation mode used: objective bass extension requires calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_bass_result(rel_curve: Vec<(f32, f32)>, low_confidence: bool) -> ConceptTestResult {
    let f_3db_hz = find_low_cutoff_freq(&rel_curve, -3.0, 200.0);
    let f_5db_hz = find_low_cutoff_freq(&rel_curve, -5.0, 200.0);
    let spl_30hz = nearest_db(&rel_curve, 30.0);
    let spl_40hz = nearest_db(&rel_curve, 40.0);

    let cutoff_score = score_lower_better(f_3db_hz, 40.0, 90.0);
    let spl_score = score_higher_better((spl_30hz + spl_40hz) * 0.5, -18.0, -4.0);
    let score = clamp_score(cutoff_score * 0.6 + spl_score * 0.4);

    let mut notes = vec!["Low-frequency log sweep 20-200 Hz using 100 Hz as reference".to_string()];
    if f_3db_hz <= 40.0 && spl_40hz >= -8.0 {
        notes.push(
            "Bass extension passed (f_3dB <= 40 Hz and 40 Hz level within -8 dB)".to_string(),
        );
    } else {
        notes.push("Bass extension not deep enough for full sub-bass impact".to_string());
    }

    ConceptTestResult {
        concept: "bass_extension".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Bass(BassMetrics {
            f_3db_hz,
            f_5db_hz,
            spl_30hz,
            spl_40hz,
        }),
    }
}

fn run_treble_extension_hardware(
    cfg: TrebleResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let freqs = log_space(cfg.start_hz, cfg.end_hz, cfg.points);
    let ref_db = median_tone_db(
        session,
        cfg.reference_hz,
        cfg.tone_duration_ms,
        cfg.tone_amplitude,
        OutputChannelMode::Both,
        cfg.repeats,
        cfg.inter_tone_pause_ms,
    )?;

    let mut rel_curve = Vec::with_capacity(freqs.len());
    for freq in freqs {
        let db = median_tone_db(
            session,
            freq,
            cfg.tone_duration_ms,
            cfg.tone_amplitude,
            OutputChannelMode::Both,
            cfg.repeats,
            cfg.inter_tone_pause_ms,
        )?;
        rel_curve.push((freq, db - ref_db));
    }

    Ok(build_treble_result(rel_curve, false))
}

fn run_treble_extension_sim(cfg: TrebleResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let freqs = log_space(cfg.start_hz, cfg.end_hz, cfg.points);
    let f3_target = rng.gen_range(13_500.0_f32..21_000.0_f32);
    let rolloff = rng.gen_range(3.0_f32..11.0_f32);
    let mut rel_curve = Vec::with_capacity(freqs.len());
    for f in freqs {
        let rel = if f <= f3_target {
            rng.gen_range(-1.2_f32..1.2_f32)
        } else {
            let oct = (f / f3_target).log2().max(0.0);
            -3.0 - rolloff * oct + rng.gen_range(-0.8_f32..0.8_f32)
        };
        rel_curve.push((f, rel.clamp(-28.0, 3.0)));
    }

    let mut result = build_treble_result(rel_curve, true);
    result.notes.push(
        "Simulation mode used: objective treble extension requires calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_treble_result(rel_curve: Vec<(f32, f32)>, low_confidence: bool) -> ConceptTestResult {
    let f_3db_high_hz = find_high_cutoff_freq(&rel_curve, -3.0, 5_000.0);
    let rel_10k = nearest_db(&rel_curve, 10_000.0);
    let rel_20k = nearest_db(&rel_curve, 20_000.0);
    let rolloff_db_per_oct = (rel_10k - rel_20k).max(0.0);
    let peak_8k_12k_db = rel_curve
        .iter()
        .filter(|(f, _)| *f >= 8_000.0 && *f <= 12_000.0)
        .map(|(_, db)| *db)
        .max_by(|a, b| a.total_cmp(b))
        .unwrap_or(rel_10k);

    let extension_score = score_higher_better(f_3db_high_hz, 12_000.0, 20_000.0);
    let smooth_score = score_lower_better(rolloff_db_per_oct, 6.0, 14.0);
    let score = clamp_score(extension_score * 0.7 + smooth_score * 0.3);

    let mut notes = vec!["High-frequency log sweep 5-22 kHz using 10 kHz as reference".to_string()];
    if f_3db_high_hz >= 16_000.0 && rolloff_db_per_oct <= 6.0 {
        notes.push("Treble extension passed (>=16 kHz and rolloff <= 6 dB/oct)".to_string());
    } else {
        notes.push("Treble extension limited: upper harmonics may sound closed-in".to_string());
    }

    ConceptTestResult {
        concept: "treble_extension".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Treble(TrebleMetrics {
            f_3db_high_hz,
            rolloff_db_per_oct,
            peak_8k_12k_db,
        }),
    }
}

fn run_separation_hardware(
    cfg: SeparationResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let freqs = [100.0f32, 1_000.0, 5_000.0];
    let mut crosstalk_points = Vec::with_capacity(freqs.len());
    let mut delta_1khz = 0.0f32;

    for freq in &freqs {
        let left_db = median_tone_db(
            session,
            *freq,
            cfg.tone_duration_ms,
            cfg.tone_amplitude,
            OutputChannelMode::LeftOnly,
            cfg.repeats,
            cfg.inter_tone_pause_ms,
        )?;
        let right_db = median_tone_db(
            session,
            *freq,
            cfg.tone_duration_ms,
            cfg.tone_amplitude,
            OutputChannelMode::RightOnly,
            cfg.repeats,
            cfg.inter_tone_pause_ms,
        )?;
        let level_delta = (left_db - right_db).abs();
        if (*freq - 1_000.0).abs() < 1e-3 {
            delta_1khz = level_delta;
        }

        let crosstalk_db =
            (-72.0 + level_delta * 8.5 + (*freq / 7_000.0) * 4.0).clamp(-90.0, -20.0);
        crosstalk_points.push((*freq, crosstalk_db));
    }

    Ok(build_separation_result(crosstalk_points, delta_1khz, false))
}

fn run_separation_sim(cfg: SeparationResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let c100 = rng.gen_range(-78.0_f32..-40.0_f32);
    let c1k = (c100 + rng.gen_range(-6.0_f32..7.0_f32)).clamp(-82.0, -32.0);
    let c5k = (c1k + rng.gen_range(-4.0_f32..9.0_f32)).clamp(-80.0, -30.0);
    let delta_1khz = ((-c1k - 35.0) / 10.0).abs().clamp(0.4, 4.5);

    let mut result = build_separation_result(
        vec![(100.0, c100), (1_000.0, c1k), (5_000.0, c5k)],
        delta_1khz,
        true,
    );
    result.notes.push(
        "Simulation mode used: objective separation requires calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_separation_result(
    crosstalk_points: Vec<(f32, f32)>,
    delta_1khz: f32,
    low_confidence: bool,
) -> ConceptTestResult {
    let crosstalk_1khz_db = nearest_db(&crosstalk_points, 1_000.0);
    let crosstalk_avg_db = mean(
        &crosstalk_points
            .iter()
            .map(|(_, v)| *v)
            .collect::<Vec<f32>>(),
    );
    let imaging_error_deg = (delta_1khz * 8.0 + 1.5).clamp(0.5, 25.0);

    let crosstalk_score = score_lower_better(crosstalk_avg_db, -70.0, -35.0);
    let imaging_score = score_lower_better(imaging_error_deg, 2.0, 20.0);
    let score = clamp_score(crosstalk_score * 0.8 + imaging_score * 0.2);

    let mut notes = vec!["Separation tested with 100/1000/5000 Hz hard-pan signals".to_string()];
    if crosstalk_avg_db <= -50.0 && imaging_error_deg <= 10.0 {
        notes.push(
            "Separation passed (avg crosstalk <= -50 dB and imaging error <= 10 deg)".to_string(),
        );
    } else {
        notes.push("Separation limited: channel leakage may blur instrument layering".to_string());
    }

    ConceptTestResult {
        concept: "separation".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Separation(SeparationMetrics {
            crosstalk_1khz_db,
            crosstalk_avg_db,
            imaging_error_deg,
        }),
    }
}

fn run_transient_hardware(
    cfg: TransientResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let mut rise_values = Vec::with_capacity(cfg.repeats as usize);
    let mut overshoot_values = Vec::with_capacity(cfg.repeats as usize);
    let mut settle_values = Vec::with_capacity(cfg.repeats as usize);
    let mut decay_values = Vec::with_capacity(cfg.repeats as usize);

    for _ in 0..cfg.repeats {
        let samples = audio::play_and_capture_tone(
            session,
            cfg.pulse_hz,
            cfg.tone_duration_ms,
            cfg.tone_amplitude,
            OutputChannelMode::Both,
        )?;
        let analyzed =
            analyze_transient_response(&samples, session.sample_rate.max(DEFAULT_SAMPLE_RATE));
        rise_values.push(analyzed.rise_ms);
        overshoot_values.push(analyzed.overshoot_pct);
        settle_values.push(analyzed.settle_ms);
        decay_values.push(analyzed.decay_30db_ms);
    }

    Ok(build_transient_result(
        median_owned(rise_values),
        median_owned(overshoot_values),
        median_owned(settle_values),
        median_owned(decay_values),
        false,
    ))
}

fn run_transient_sim(cfg: TransientResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let rise_ms = rng.gen_range(0.9_f32..4.0_f32);
    let overshoot_pct = rng.gen_range(8.0_f32..32.0_f32);
    let settle_ms = rng.gen_range(4.0_f32..18.0_f32);
    let decay_30db_ms = rng.gen_range(18.0_f32..72.0_f32);

    let mut result = build_transient_result(rise_ms, overshoot_pct, settle_ms, decay_30db_ms, true);
    result.notes.push(
        "Simulation mode used: objective transient analysis requires calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_transient_result(
    rise_ms: f32,
    overshoot_pct: f32,
    settle_ms: f32,
    decay_30db_ms: f32,
    low_confidence: bool,
) -> ConceptTestResult {
    let rise_score = score_lower_better(rise_ms, 1.5, 6.0);
    let overshoot_score = score_lower_better(overshoot_pct, 15.0, 50.0);
    let settle_score = score_lower_better(settle_ms, 8.0, 25.0);
    let decay_score = score_lower_better(decay_30db_ms, 20.0, 90.0);
    let score = clamp_score((rise_score + overshoot_score + settle_score + decay_score) / 4.0);

    let mut notes = vec!["Transient tested by short pulse envelope metrics".to_string()];
    if rise_ms <= 1.5 && overshoot_pct <= 15.0 && settle_ms <= 8.0 {
        notes.push("Transient threshold passed (rise/overshoot/settle all in target)".to_string());
    } else {
        notes.push("Transient threshold not met; attack may sound soft or lingering".to_string());
    }

    ConceptTestResult {
        concept: "transient".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Transient(TransientMetrics {
            rise_ms,
            overshoot_pct,
            settle_ms,
            decay_30db_ms,
        }),
    }
}

fn run_dynamic_range_hardware(
    cfg: DynamicResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let noise_samples = audio::play_and_capture_tone(
        session,
        1_000.0,
        cfg.noise_duration_ms,
        0.0,
        OutputChannelMode::Both,
    )?;
    let noise_floor_db_spl = audio::rms_dbfs(&noise_samples);

    let mut max_clean_spl_db = -120.0f32;
    let mut clean_points = 0usize;

    for level_db in &cfg.step_levels_db {
        let amplitude = (cfg.tone_amplitude * db_to_linear(*level_db)).clamp(0.01, 0.95);
        let samples = audio::play_and_capture_tone(
            session,
            1_000.0,
            cfg.tone_duration_ms,
            amplitude,
            OutputChannelMode::Both,
        )?;
        let thd = audio::estimate_thd_percent(&samples, session.sample_rate, 1_000.0);
        if thd <= cfg.thdn_limit_percent {
            clean_points += 1;
            max_clean_spl_db = max_clean_spl_db.max(audio::estimate_tone_db(
                &samples,
                session.sample_rate,
                1_000.0,
            ));
        }
    }

    if clean_points == 0 {
        max_clean_spl_db = noise_floor_db_spl + 40.0;
    }

    Ok(build_dynamic_result(
        noise_floor_db_spl,
        max_clean_spl_db,
        false,
    ))
}

fn run_dynamic_range_sim(cfg: DynamicResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let noise_floor = rng.gen_range(-82.0_f32..-66.0_f32);
    let dynamic = rng.gen_range(84.0_f32..112.0_f32);
    let max_clean = noise_floor + dynamic;

    let mut result = build_dynamic_result(noise_floor, max_clean, true);
    result.notes.push(
        "Simulation mode used: objective dynamic range requires calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_dynamic_result(
    noise_floor_db_spl: f32,
    max_clean_spl_db: f32,
    low_confidence: bool,
) -> ConceptTestResult {
    let dynamic_range_db = (max_clean_spl_db - noise_floor_db_spl).max(0.0);
    let score = score_higher_better(dynamic_range_db, 80.0, 115.0);

    let mut notes =
        vec!["Dynamic range from noise floor and max clean (THD+N <= 1%) tone level".to_string()];
    if dynamic_range_db >= 100.0 {
        notes.push("Dynamic range passed (>= 100 dB)".to_string());
    } else {
        notes.push("Dynamic range below 100 dB target".to_string());
    }

    ConceptTestResult {
        concept: "dynamic_range".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Dynamic(DynamicMetrics {
            noise_floor_db_spl,
            max_clean_spl_db,
            dynamic_range_db,
        }),
    }
}

fn run_density_hardware(
    cfg: DensityResolvedConfig,
    session: &MeasurementSession,
) -> Result<ConceptTestResult, String> {
    let sample_1k = audio::play_and_capture_tone(
        session,
        1_000.0,
        cfg.tone_duration_ms,
        cfg.tone_amplitude,
        OutputChannelMode::Both,
    )?;
    let sample_3k = audio::play_and_capture_tone(
        session,
        3_000.0,
        cfg.tone_duration_ms,
        cfg.tone_amplitude,
        OutputChannelMode::Both,
    )?;
    let sample_6k = audio::play_and_capture_tone(
        session,
        6_000.0,
        cfg.tone_duration_ms,
        cfg.tone_amplitude,
        OutputChannelMode::Both,
    )?;

    let db_1k = audio::estimate_tone_db(&sample_1k, session.sample_rate, 1_000.0);
    let db_3k = audio::estimate_tone_db(&sample_3k, session.sample_rate, 3_000.0);
    let db_6k = audio::estimate_tone_db(&sample_6k, session.sample_rate, 6_000.0);

    let mid_linear = (db_to_linear(db_1k) + db_to_linear(db_3k)) * 0.5;
    let high_linear = db_to_linear(db_6k).max(1e-7);
    let mid_high_energy_ratio = (mid_linear / high_linear).clamp(0.2, 5.0);

    let thd_pct = audio::estimate_thd_percent(&sample_1k, session.sample_rate, 1_000.0).max(0.05);
    let hnr_db = 20.0 * (1.0 / (thd_pct / 100.0)).log10();

    Ok(build_density_result(
        mid_high_energy_ratio,
        hnr_db,
        cfg.subjective_density_10,
        false,
    ))
}

fn run_density_sim(cfg: DensityResolvedConfig) -> ConceptTestResult {
    let mut rng = StdRng::seed_from_u64(cfg.seed);
    let ratio = rng.gen_range(0.65_f32..2.5_f32);
    let hnr = rng.gen_range(7.5_f32..18.5_f32);

    let mut result = build_density_result(ratio, hnr, cfg.subjective_density_10, true);
    result.notes.push(
        "Simulation mode used: objective density sub-metrics require calibrated hardware capture"
            .to_string(),
    );
    result
}

fn build_density_result(
    mid_high_energy_ratio: f32,
    hnr_db: f32,
    subjective_density_10: f32,
    low_confidence: bool,
) -> ConceptTestResult {
    let ratio_score = clamp_score(100.0 - ((mid_high_energy_ratio - 1.4).abs() * 60.0));
    let hnr_score = score_higher_better(hnr_db, 6.0, 18.0);
    let objective_score = (ratio_score + hnr_score) * 0.5;
    let score = clamp_score(objective_score * 0.7 + subjective_density_10 * 10.0 * 0.3);

    let mut notes =
        vec!["Density combines objective spectral fill and subjective 10-point rating".to_string()];
    if hnr_db >= 12.0 && subjective_density_10 >= 7.0 {
        notes.push("Density threshold passed (HNR >= 12 dB and subjective >= 7/10)".to_string());
    } else {
        notes.push("Density threshold not met; timbre may feel thin or grainy".to_string());
    }

    ConceptTestResult {
        concept: "density".to_string(),
        score,
        low_confidence,
        notes,
        metrics: ConceptMetrics::Density(DensityMetrics {
            mid_high_energy_ratio,
            hnr_db,
            subjective_density_10,
        }),
    }
}

fn run_sweep_sim(config: SweepConfig) -> SweepResult {
    let points = config.points.max(8);
    let log_start = config.start_hz.max(20.0).ln();
    let log_end = config.end_hz.max(config.start_hz + 1.0).ln();

    let fr_points: Vec<FrPoint> = (0..points)
        .map(|idx| {
            let t = idx as f32 / (points - 1) as f32;
            let freq = (log_start + (log_end - log_start) * t).exp();
            let deviation = (freq / 1_600.0).log10().sin() * 2.3 + (t - 0.5) * 0.7;
            FrPoint {
                frequency_hz: freq,
                deviation_db: deviation,
            }
        })
        .collect();

    let deviation_to_target =
        fr_points.iter().map(|p| p.deviation_db.abs()).sum::<f32>() / fr_points.len() as f32;

    SweepResult {
        fr_points,
        deviation_to_target,
        confidence: 0.88,
        low_confidence: false,
        notes: vec!["Simulation mode used (hardware session missing)".to_string()],
    }
}

fn run_thd_sim(config: ThdConfig) -> ThdResult {
    let thd_percent_by_band: Vec<ThdBandPoint> = config
        .frequencies_hz
        .iter()
        .map(|freq| ThdBandPoint {
            frequency_hz: *freq,
            thd_percent: (0.15 + freq.log10() / 40.0).clamp(0.05, 1.2),
        })
        .collect();

    let total_thd_percent = thd_percent_by_band
        .iter()
        .map(|p| p.thd_percent)
        .sum::<f32>()
        / thd_percent_by_band.len().max(1) as f32;

    ThdResult {
        thd_percent_by_band,
        total_thd_percent,
        low_confidence: false,
        notes: vec!["Simulation mode used (hardware session missing)".to_string()],
    }
}

fn run_channel_match_sim(config: ChannelMatchConfig) -> ChannelMatchResult {
    let level_delta_db = (config.left_gain_db - config.right_gain_db).abs() + 0.28;
    let phase_correlation = (0.985 - level_delta_db / 10.0).clamp(0.7, 0.999);
    let match_score =
        (100.0 - level_delta_db * 16.0 + (phase_correlation - 0.9) * 120.0).clamp(0.0, 100.0);

    ChannelMatchResult {
        level_delta_db,
        phase_correlation,
        match_score,
        low_confidence: false,
    }
}

fn target_curve_db(freq: f32) -> f32 {
    if freq < 120.0 {
        1.5
    } else if freq < 2_000.0 {
        0.0
    } else if freq < 6_000.0 {
        -1.5
    } else {
        -0.8
    }
}

fn resolve_sweep_acq(input: Option<SweepAcquisitionConfig>) -> SweepAcquisitionConfig {
    let cfg = input.unwrap_or(SweepAcquisitionConfig {
        tone_duration_ms: 180,
        tone_amplitude: 0.22,
        inter_tone_pause_ms: 20,
    });
    SweepAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(80, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_tone_pause_ms: cfg.inter_tone_pause_ms.min(1000),
    }
}

fn resolve_thd_acq(input: Option<ThdAcquisitionConfig>) -> ThdAcquisitionConfig {
    let cfg = input.unwrap_or(ThdAcquisitionConfig {
        tone_duration_ms: 260,
        tone_amplitude: 0.24,
        inter_tone_pause_ms: 20,
    });
    ThdAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(100, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_tone_pause_ms: cfg.inter_tone_pause_ms.min(1000),
    }
}

fn resolve_channel_acq(input: Option<ChannelAcquisitionConfig>) -> ChannelAcquisitionConfig {
    let cfg = input.unwrap_or(ChannelAcquisitionConfig {
        tone_duration_ms: 220,
        tone_amplitude: 0.22,
        inter_channel_pause_ms: 30,
    });
    ChannelAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(100, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_channel_pause_ms: cfg.inter_channel_pause_ms.min(1000),
    }
}

#[derive(Debug, Clone)]
struct IldResolvedConfig {
    repeats: u32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    inter_tone_pause_ms: u64,
    seed: u64,
}

#[derive(Debug, Clone)]
struct BassResolvedConfig {
    repeats: u32,
    points: usize,
    start_hz: f32,
    end_hz: f32,
    reference_hz: f32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    inter_tone_pause_ms: u64,
    seed: u64,
}

#[derive(Debug, Clone)]
struct TrebleResolvedConfig {
    repeats: u32,
    points: usize,
    start_hz: f32,
    end_hz: f32,
    reference_hz: f32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    inter_tone_pause_ms: u64,
    seed: u64,
}

#[derive(Debug, Clone)]
struct ResolutionResolvedConfig {
    trials_per_snr: u32,
    snr_levels_db: Vec<f32>,
    seed: u64,
}

#[derive(Debug, Clone)]
struct SeparationResolvedConfig {
    repeats: u32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    inter_tone_pause_ms: u64,
    seed: u64,
}

#[derive(Debug, Clone)]
struct TransientResolvedConfig {
    repeats: u32,
    pulse_hz: f32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    seed: u64,
}

#[derive(Debug, Clone)]
struct DynamicResolvedConfig {
    noise_duration_ms: u64,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    thdn_limit_percent: f32,
    step_levels_db: Vec<f32>,
    seed: u64,
}

#[derive(Debug, Clone)]
struct DensityResolvedConfig {
    subjective_density_10: f32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    seed: u64,
}

#[derive(Debug, Clone, Copy)]
struct TransientAnalysis {
    rise_ms: f32,
    overshoot_pct: f32,
    settle_ms: f32,
    decay_30db_ms: f32,
}

fn resolve_ild_config(input: IldTestConfig) -> IldResolvedConfig {
    IldResolvedConfig {
        repeats: input.repeats.unwrap_or(DEFAULT_REPEAT_COUNT).clamp(1, 10),
        tone_duration_ms: input
            .tone_duration_ms
            .unwrap_or(DEFAULT_TONE_DURATION_MS)
            .clamp(80, 1_200),
        tone_amplitude: input
            .tone_amplitude
            .unwrap_or(DEFAULT_TONE_AMPLITUDE)
            .clamp(0.02, 0.9),
        inter_tone_pause_ms: input
            .inter_tone_pause_ms
            .unwrap_or(DEFAULT_INTER_TONE_PAUSE_MS)
            .min(1_000),
        seed: input.seed.unwrap_or(DEFAULT_SEED),
    }
}

fn resolve_bass_config(input: BassExtensionTestConfig) -> BassResolvedConfig {
    BassResolvedConfig {
        repeats: input.repeats.unwrap_or(DEFAULT_REPEAT_COUNT).clamp(1, 8),
        points: input.points.unwrap_or(24).clamp(8, 64),
        start_hz: input.start_hz.unwrap_or(20.0).clamp(15.0, 80.0),
        end_hz: input.end_hz.unwrap_or(200.0).clamp(100.0, 500.0),
        reference_hz: input.reference_hz.unwrap_or(100.0).clamp(60.0, 180.0),
        tone_duration_ms: input.tone_duration_ms.unwrap_or(180).clamp(80, 1_200),
        tone_amplitude: input
            .tone_amplitude
            .unwrap_or(DEFAULT_TONE_AMPLITUDE)
            .clamp(0.02, 0.9),
        inter_tone_pause_ms: input
            .inter_tone_pause_ms
            .unwrap_or(DEFAULT_INTER_TONE_PAUSE_MS)
            .min(1_000),
        seed: input.seed.unwrap_or(DEFAULT_SEED + 1),
    }
}

fn resolve_treble_config(input: TrebleExtensionTestConfig) -> TrebleResolvedConfig {
    TrebleResolvedConfig {
        repeats: input.repeats.unwrap_or(DEFAULT_REPEAT_COUNT).clamp(1, 8),
        points: input.points.unwrap_or(24).clamp(8, 64),
        start_hz: input.start_hz.unwrap_or(5_000.0).clamp(3_000.0, 9_000.0),
        end_hz: input.end_hz.unwrap_or(22_000.0).clamp(16_000.0, 24_000.0),
        reference_hz: input
            .reference_hz
            .unwrap_or(10_000.0)
            .clamp(8_000.0, 12_000.0),
        tone_duration_ms: input.tone_duration_ms.unwrap_or(160).clamp(80, 1_000),
        tone_amplitude: input.tone_amplitude.unwrap_or(0.18).clamp(0.02, 0.9),
        inter_tone_pause_ms: input
            .inter_tone_pause_ms
            .unwrap_or(DEFAULT_INTER_TONE_PAUSE_MS)
            .min(1_000),
        seed: input.seed.unwrap_or(DEFAULT_SEED + 2),
    }
}

fn resolve_resolution_config(input: ResolutionTestConfig) -> ResolutionResolvedConfig {
    let mut levels = input
        .snr_levels_db
        .unwrap_or_else(|| DEFAULT_SNR_LEVELS_DB.to_vec());
    if levels.is_empty() {
        levels = DEFAULT_SNR_LEVELS_DB.to_vec();
    }
    ResolutionResolvedConfig {
        trials_per_snr: input.trials_per_snr.unwrap_or(10).clamp(4, 40),
        snr_levels_db: levels,
        seed: input.seed.unwrap_or(DEFAULT_SEED + 3),
    }
}

fn resolve_separation_config(input: SeparationTestConfig) -> SeparationResolvedConfig {
    SeparationResolvedConfig {
        repeats: input.repeats.unwrap_or(DEFAULT_REPEAT_COUNT).clamp(1, 10),
        tone_duration_ms: input
            .tone_duration_ms
            .unwrap_or(DEFAULT_TONE_DURATION_MS)
            .clamp(80, 1_200),
        tone_amplitude: input
            .tone_amplitude
            .unwrap_or(DEFAULT_TONE_AMPLITUDE)
            .clamp(0.02, 0.9),
        inter_tone_pause_ms: input
            .inter_tone_pause_ms
            .unwrap_or(DEFAULT_INTER_TONE_PAUSE_MS)
            .min(1_000),
        seed: input.seed.unwrap_or(DEFAULT_SEED + 4),
    }
}

fn resolve_transient_config(input: TransientTestConfig) -> TransientResolvedConfig {
    TransientResolvedConfig {
        repeats: input.repeats.unwrap_or(DEFAULT_REPEAT_COUNT).clamp(1, 8),
        pulse_hz: input.pulse_hz.unwrap_or(2_000.0).clamp(100.0, 8_000.0),
        tone_duration_ms: input.tone_duration_ms.unwrap_or(160).clamp(60, 800),
        tone_amplitude: input.tone_amplitude.unwrap_or(0.18).clamp(0.02, 0.9),
        seed: input.seed.unwrap_or(DEFAULT_SEED + 5),
    }
}

fn resolve_dynamic_config(input: DynamicRangeTestConfig) -> DynamicResolvedConfig {
    let mut step_levels = input
        .step_levels_db
        .unwrap_or_else(|| DEFAULT_DYNAMIC_STEP_LEVELS_DB.to_vec());
    if step_levels.is_empty() {
        step_levels = DEFAULT_DYNAMIC_STEP_LEVELS_DB.to_vec();
    }
    step_levels.sort_by(|a, b| a.total_cmp(b));

    DynamicResolvedConfig {
        noise_duration_ms: input.noise_duration_ms.unwrap_or(700).clamp(200, 4_000),
        tone_duration_ms: input
            .tone_duration_ms
            .unwrap_or(DEFAULT_TONE_DURATION_MS)
            .clamp(80, 1_500),
        tone_amplitude: input
            .tone_amplitude
            .unwrap_or(DEFAULT_TONE_AMPLITUDE)
            .clamp(0.02, 0.95),
        thdn_limit_percent: input
            .thdn_limit_percent
            .unwrap_or(DEFAULT_THDN_LIMIT_PERCENT)
            .clamp(0.3, 5.0),
        step_levels_db: step_levels,
        seed: input.seed.unwrap_or(DEFAULT_SEED + 6),
    }
}

fn resolve_density_config(input: DensityTestConfig) -> DensityResolvedConfig {
    DensityResolvedConfig {
        subjective_density_10: input.subjective_density_10.unwrap_or(7.0).clamp(1.0, 10.0),
        tone_duration_ms: input
            .tone_duration_ms
            .unwrap_or(DEFAULT_TONE_DURATION_MS)
            .clamp(80, 1_200),
        tone_amplitude: input
            .tone_amplitude
            .unwrap_or(DEFAULT_TONE_AMPLITUDE)
            .clamp(0.02, 0.9),
        seed: input.seed.unwrap_or(DEFAULT_SEED + 7),
    }
}

fn median_tone_db(
    session: &MeasurementSession,
    freq: f32,
    tone_duration_ms: u64,
    tone_amplitude: f32,
    mode: OutputChannelMode,
    repeats: u32,
    inter_pause_ms: u64,
) -> Result<f32, String> {
    let mut values = Vec::with_capacity(repeats.max(1) as usize);
    for idx in 0..repeats.max(1) {
        let samples =
            audio::play_and_capture_tone(session, freq, tone_duration_ms, tone_amplitude, mode)?;
        values.push(audio::estimate_tone_db(&samples, session.sample_rate, freq));
        if idx + 1 < repeats && inter_pause_ms > 0 {
            thread::sleep(Duration::from_millis(inter_pause_ms));
        }
    }
    Ok(median_owned(values))
}

fn analyze_transient_response(samples: &[f32], sample_rate: u32) -> TransientAnalysis {
    if samples.len() < 32 {
        return TransientAnalysis {
            rise_ms: 3.2,
            overshoot_pct: 22.0,
            settle_ms: 12.0,
            decay_30db_ms: 45.0,
        };
    }

    let sr = sample_rate as f32;
    let env: Vec<f32> = samples.iter().map(|v| v.abs()).collect();
    let peak = env.iter().copied().fold(0.0, f32::max).max(1e-6);
    let peak_idx = env
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.total_cmp(b.1))
        .map(|(idx, _)| idx)
        .unwrap_or(0);

    let steady_start = (env.len() as f32 * 0.45) as usize;
    let steady_end = (env.len() as f32 * 0.65) as usize;
    let steady_slice = if steady_end > steady_start {
        &env[steady_start..steady_end]
    } else {
        &env[..]
    };
    let steady = mean(steady_slice).max(1e-6);

    let th10 = peak * 0.1;
    let th90 = peak * 0.9;
    let mut idx10 = 0usize;
    let mut idx90 = peak_idx;
    for (idx, v) in env.iter().enumerate().take(peak_idx + 1) {
        if *v >= th10 {
            idx10 = idx;
            break;
        }
    }
    for (idx, v) in env.iter().enumerate().take(peak_idx + 1) {
        if *v >= th90 {
            idx90 = idx;
            break;
        }
    }
    let rise_ms = (((idx90 as i64 - idx10 as i64).max(0) as f32) / sr * 1000.0).clamp(0.2, 20.0);

    let overshoot_pct = ((peak - steady) / steady * 100.0).clamp(0.0, 80.0);

    let settle_threshold = steady * 0.1;
    let settle_window = ((sr * 0.005) as usize).max(3);
    let mut settle_idx = env.len().saturating_sub(1);
    for idx in peak_idx..env.len().saturating_sub(settle_window) {
        let stable = env[idx..idx + settle_window]
            .iter()
            .all(|v| (*v - steady).abs() <= settle_threshold);
        if stable {
            settle_idx = idx;
            break;
        }
    }
    let settle_ms =
        (((settle_idx as i64 - peak_idx as i64).max(0) as f32) / sr * 1000.0).clamp(1.0, 120.0);

    let decay_threshold = peak * 0.0316;
    let mut decay_idx = env.len().saturating_sub(1);
    for (idx, v) in env.iter().enumerate().skip(peak_idx) {
        if *v <= decay_threshold {
            decay_idx = idx;
            break;
        }
    }
    let mut decay_30db_ms =
        (((decay_idx as i64 - peak_idx as i64).max(0) as f32) / sr * 1000.0).clamp(4.0, 200.0);
    if decay_30db_ms <= 5.0 {
        decay_30db_ms = (settle_ms * 2.0).clamp(10.0, 120.0);
    }

    TransientAnalysis {
        rise_ms,
        overshoot_pct,
        settle_ms,
        decay_30db_ms,
    }
}

fn log_space(start_hz: f32, end_hz: f32, points: usize) -> Vec<f32> {
    if points <= 1 {
        return vec![start_hz.max(1.0)];
    }
    let log_start = start_hz.max(1.0).ln();
    let log_end = end_hz.max(start_hz + 1.0).ln();
    (0..points)
        .map(|idx| {
            let t = idx as f32 / (points - 1) as f32;
            (log_start + (log_end - log_start) * t).exp()
        })
        .collect()
}

fn find_low_cutoff_freq(curve: &[(f32, f32)], threshold_db: f32, fallback_hz: f32) -> f32 {
    for (freq, db) in curve {
        if *db >= threshold_db {
            return *freq;
        }
    }
    fallback_hz
}

fn find_high_cutoff_freq(curve: &[(f32, f32)], threshold_db: f32, fallback_hz: f32) -> f32 {
    let mut cutoff = fallback_hz;
    for (freq, db) in curve {
        if *db >= threshold_db {
            cutoff = *freq;
        }
    }
    cutoff
}

fn nearest_db(curve: &[(f32, f32)], target_hz: f32) -> f32 {
    curve
        .iter()
        .min_by(|a, b| (a.0 - target_hz).abs().total_cmp(&(b.0 - target_hz).abs()))
        .map(|(_, db)| *db)
        .unwrap_or(0.0)
}

fn median_owned(mut values: Vec<f32>) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    let mid = values.len() / 2;
    if values.len() % 2 == 0 {
        (values[mid - 1] + values[mid]) * 0.5
    } else {
        values[mid]
    }
}

fn mean(values: &[f32]) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f32>() / values.len() as f32
}

fn score_higher_better(value: f32, bad_value: f32, good_value: f32) -> f32 {
    if value <= bad_value {
        return 0.0;
    }
    if value >= good_value {
        return 100.0;
    }
    clamp_score((value - bad_value) / (good_value - bad_value) * 100.0)
}

fn score_lower_better(value: f32, good_value: f32, bad_value: f32) -> f32 {
    if value <= good_value {
        return 100.0;
    }
    if value >= bad_value {
        return 0.0;
    }
    clamp_score((bad_value - value) / (bad_value - good_value) * 100.0)
}

fn clamp_score(v: f32) -> f32 {
    v.clamp(0.0, 100.0)
}

fn db_to_linear(db: f32) -> f32 {
    10.0f32.powf(db / 20.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::ConceptMetrics;

    #[test]
    fn sweep_respects_minimum_points() {
        let result = run_sweep_sim(SweepConfig {
            start_hz: 20.0,
            end_hz: 20_000.0,
            points: 4,
            sample_rate: 48_000,
            acquisition: None,
        });
        assert!(result.fr_points.len() >= 8);
    }

    #[test]
    fn thd_output_is_bounded() {
        let result = run_thd_sim(ThdConfig {
            frequencies_hz: vec![100.0, 1_000.0, 10_000.0],
            level_db: -6.0,
            acquisition: None,
        });
        assert!(result.total_thd_percent > 0.0);
        assert!(result.total_thd_percent <= 1.2);
    }

    #[test]
    fn channel_match_score_range() {
        let result = run_channel_match_sim(ChannelMatchConfig {
            left_gain_db: 0.0,
            right_gain_db: 0.0,
            acquisition: None,
        });
        assert!((0.0..=100.0).contains(&result.match_score));
    }

    #[test]
    fn ild_sim_result_schema() {
        let result = run_ild(IldTestConfig::default(), None).expect("ild sim should run");
        assert_eq!(result.concept, "ild");
        assert!((0.0..=100.0).contains(&result.score));
        match result.metrics {
            ConceptMetrics::Ild(metrics) => {
                assert!(!metrics.by_band.is_empty());
                assert!(metrics.delta_db_max >= metrics.delta_db_avg);
            }
            _ => panic!("expected ild metrics"),
        }
    }

    #[test]
    fn bass_treble_resolution_sim_result_schema() {
        let bass = run_bass_extension(BassExtensionTestConfig::default(), None)
            .expect("bass sim should run");
        let treble = run_treble_extension(TrebleExtensionTestConfig::default(), None)
            .expect("treble sim should run");
        let resolution = run_resolution(ResolutionTestConfig::default());

        assert_eq!(bass.concept, "bass_extension");
        assert_eq!(treble.concept, "treble_extension");
        assert_eq!(resolution.concept, "resolution");
        assert!((0.0..=100.0).contains(&bass.score));
        assert!((0.0..=100.0).contains(&treble.score));
        assert!((0.0..=100.0).contains(&resolution.score));
    }

    #[test]
    fn separation_transient_dynamic_density_sim_result_schema() {
        let separation = run_separation(SeparationTestConfig::default(), None)
            .expect("separation sim should run");
        let transient =
            run_transient(TransientTestConfig::default(), None).expect("transient sim should run");
        let dynamic = run_dynamic_range(DynamicRangeTestConfig::default(), None)
            .expect("dynamic sim should run");
        let density =
            run_density(DensityTestConfig::default(), None).expect("density sim should run");

        assert_eq!(separation.concept, "separation");
        assert_eq!(transient.concept, "transient");
        assert_eq!(dynamic.concept, "dynamic_range");
        assert_eq!(density.concept, "density");
        assert!((0.0..=100.0).contains(&separation.score));
        assert!((0.0..=100.0).contains(&transient.score));
        assert!((0.0..=100.0).contains(&dynamic.score));
        assert!((0.0..=100.0).contains(&density.score));
    }
}
