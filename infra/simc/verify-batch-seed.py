"""Compare auction profileset rows with standalone SimC at both auction precisions."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def verify(binary, profile):
    ring = "finger1=test_ring,id=258910,source=local,bonus_id=6652/13668/13901,drop_level=90,content_tuning=3321"
    options = ["max_time=30", "fixed_time=1", "vary_combat_length=0", "desired_targets=1",
               "threads=1", "deterministic=1", "profileset_work_threads=0", "profileset_init_threads=1",
               "calculate_scale_factors=0", "report_details=1"]
    cases = [ring, ring + ",gem_id=22459", ring + ",gem_id=130215"]

    with tempfile.TemporaryDirectory() as directory:
        report = Path(directory) / "report.json"

        def simulate(arguments, iterations, seed):
            subprocess.run([binary, profile, *options, *arguments, f"iterations={iterations}",
                            f"seed={seed}", f"json={report}"], cwd=directory, check=True,
                           env={**os.environ, "GILDRA_SIMC_BATCH_SINGLE_INIT": "1"}, stdout=subprocess.DEVNULL)
            return json.loads(report.read_text())["sim"]

        def primary(sim):
            result = sim["players"][0]["collected_data"]["dps"]
            return result["mean"], result["mean_std_dev"]

        for iterations in [100, 750]:
            for seed in [31459, 4862137]:
                single = [primary(simulate([case], iterations, seed)) for case in cases]
                batch = simulate([cases[0], *(f"profileset.c{i}+={case}" for i, case in enumerate(cases[1:], 1))],
                                 iterations, seed)
                expected = {f"c{i}": (*score, iterations) for i, score in enumerate(single[1:], 1)}
                measured = {row["name"]: (row["mean"], row["mean_stddev"], row["iterations"])
                            for row in batch["profilesets"]["results"]}
                if primary(batch) != single[0] or measured != expected:
                    raise AssertionError(f"Standalone and batch results differ at seed {seed}, {iterations} iterations")


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("simc", type=Path)
    args.add_argument("profile", type=Path)
    paths = args.parse_args()
    verify(paths.simc.resolve(), paths.profile.resolve())
