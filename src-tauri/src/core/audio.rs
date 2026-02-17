use cpal::traits::{DeviceTrait, HostTrait};

use super::models::{CalibrationSession, DeviceInfo};

pub fn list_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let mut devices: Vec<DeviceInfo> = host
        .devices()
        .ok()
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(idx, dev)| {
            let name = dev.name().unwrap_or_else(|_| format!("Device {idx}"));
            let mut channels: u16 = 2;
            let mut rates = vec![44_100, 48_000, 96_000];

            if let Ok(cfg) = dev.default_input_config() {
                channels = cfg.channels();
                rates = vec![cfg.sample_rate().0, 44_100, 48_000, 96_000];
                rates.sort_unstable();
                rates.dedup();
            }

            DeviceInfo {
                id: format!("dev-{idx}"),
                name,
                channels,
                supported_sample_rates: rates,
            }
        })
        .collect();

    if devices.is_empty() {
        devices.push(DeviceInfo {
            id: "fallback-in".to_string(),
            name: "Fallback Input".to_string(),
            channels: 2,
            supported_sample_rates: vec![44_100, 48_000],
        });
        devices.push(DeviceInfo {
            id: "fallback-out".to_string(),
            name: "Fallback Output".to_string(),
            channels: 2,
            supported_sample_rates: vec![44_100, 48_000],
        });
    }

    devices
}

pub fn calibrate(sample_rate: u32) -> CalibrationSession {
    let noise_floor_db = if sample_rate >= 48_000 { -69.5 } else { -64.2 };
    let ref_level_db = -20.0;
    let mut warnings = Vec::new();
    let status = if noise_floor_db > -60.0 {
        warnings.push("Noise floor is high; re-run in a quieter room".to_string());
        "warning".to_string()
    } else {
        "ready".to_string()
    };

    CalibrationSession {
        ref_level_db,
        noise_floor_db,
        status,
        warnings,
    }
}
