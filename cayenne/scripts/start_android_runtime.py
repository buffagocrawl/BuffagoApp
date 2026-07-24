from __future__ import annotations

import argparse
import json
from pathlib import Path

from android_lifecycle import AndroidLifecycle, RuntimeFailure


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", default="emulator-5554")
    parser.add_argument("--run-directory", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    runtime = AndroidLifecycle(root, args.run_directory, device=args.device_id)
    report = {}
    try:
        runtime.recover_stale_owned(root / "artifacts" / "cayenne" / "runs")
        report["adbStart"] = runtime.start_adb()
        report["emulatorStart"] = runtime.start_emulator()
        report["adbRecovery"] = runtime.wait_for_device()
        report["emulatorBoot"] = runtime.wait_for_boot()
        report["package"] = runtime.verify_package()
        report["metroStart"] = runtime.start_metro()
        report["bundlePrewarm"] = runtime.prewarm_bundle()
        report["devClientConnection"] = runtime.connect_dev_client()
        report["status"] = "READY"
        print(json.dumps(report, indent=2))
        return 0
    except RuntimeFailure as exc:
        report.update({"status": "BLOCKED", "category": exc.category, "message": str(exc)})
        print(json.dumps(report, indent=2))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
