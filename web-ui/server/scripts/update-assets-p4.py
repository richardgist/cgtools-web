#!/usr/bin/env python3
import argparse
import concurrent.futures
import json
import subprocess
import sys
from typing import Iterable, List


def parse_json_list(raw: str) -> List[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON list: {exc}") from exc
    if parsed is None:
        return []
    if not isinstance(parsed, list):
        parsed = [parsed]
    return [str(item).strip() for item in parsed if str(item).strip()]


def run_p4_sync(spec: str) -> None:
    print(f"[version] p4 sync {spec}", flush=True)
    completed = subprocess.run(["p4", "sync", spec], check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"p4 sync failed with exitCode={completed.returncode}: {spec}")


def sync_many(specs: Iterable[str], label: str, use_parallel: bool) -> None:
    sync_specs = list(specs)
    if not sync_specs:
        return

    print(f"[version] P4 {label}: {len(sync_specs)} target(s)", flush=True)
    if not use_parallel or len(sync_specs) == 1:
        for spec in sync_specs:
            run_p4_sync(spec)
        return

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(sync_specs)) as executor:
        futures = [executor.submit(run_p4_sync, spec) for spec in sync_specs]
        for future in concurrent.futures.as_completed(futures):
            future.result()


def build_base_specs(paths: List[str], merged_p4_head: str) -> List[str]:
    if not merged_p4_head:
        return []
    return [f"{path}\\...@{merged_p4_head}" for path in paths]


def build_change_specs(paths: List[str], change: str) -> List[str]:
    return [f"{path}\\...@={change}" for path in paths]


def main() -> int:
    parser = argparse.ArgumentParser(description="Update P4 asset paths for a version handoff.")
    parser.add_argument("--merged-p4-head", default="")
    parser.add_argument("--p4-merge-json", default="[]")
    parser.add_argument("--p4-sync-paths-json", default="[]")
    parser.add_argument("--parallel", choices=["true", "false"], default="true")
    args = parser.parse_args()

    try:
        targets = parse_json_list(args.p4_sync_paths_json)
        single_changes = parse_json_list(args.p4_merge_json)
    except ValueError as exc:
        print(f"[version] {exc}", file=sys.stderr, flush=True)
        return 1

    if not targets:
        print("[version] No P4 safe sync paths were provided.", file=sys.stderr, flush=True)
        return 1

    use_parallel = args.parallel == "true"
    try:
        sync_many(build_base_specs(targets, args.merged_p4_head), f"base @{args.merged_p4_head}", use_parallel)
        for change in single_changes:
            sync_many(build_change_specs(targets, change), f"change @{change}", use_parallel)
    except Exception as exc:
        print(f"[version] {exc}", file=sys.stderr, flush=True)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
