export type DeviceSelection = {
  cameraId?: string;
  microphoneId?: string;
};

export type ContributionPreset = "LOW" | "STANDARD" | "HIGH" | "BROADCAST";

const VIDEO_PRESETS: Record<ContributionPreset, MediaTrackConstraints> = {
  LOW: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30, max: 30 } },
  STANDARD: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
  HIGH: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
  BROADCAST: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } },
};

export class MediaDeviceManager {
  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: devices.filter((device) => device.kind === "videoinput"),
      microphones: devices.filter((device) => device.kind === "audioinput"),
      speakers: devices.filter((device) => device.kind === "audiooutput"),
    };
  }

  async open(selection: DeviceSelection, preset: ContributionPreset = "STANDARD") {
    return navigator.mediaDevices.getUserMedia({
      video: {
        ...VIDEO_PRESETS[preset],
        ...(selection.cameraId ? { deviceId: { exact: selection.cameraId } } : {}),
      },
      audio: {
        ...(selection.microphoneId ? { deviceId: { exact: selection.microphoneId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
  }

  async replaceTrack(sender: RTCRtpSender, deviceId: string, kind: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "audio" ? { deviceId: { exact: deviceId } } : false,
      video: kind === "video" ? { deviceId: { exact: deviceId } } : false,
    });
    const track = stream.getTracks()[0];
    if (!track) throw new Error(`No ${kind} track returned by selected device`);
    const previous = sender.track;
    await sender.replaceTrack(track);
    previous?.stop();
    return track;
  }
}
