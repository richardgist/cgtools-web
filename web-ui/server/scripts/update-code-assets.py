#!/usr/bin/env python3
import argparse
import concurrent.futures
import json
import re
import subprocess
import sys
from typing import Iterable, List, Sequence


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


def extract_number(text: str, label: str) -> str:
    match = re.search(rf"{label}\s*[:：]\s*(\d+)", text, flags=re.IGNORECASE)
    return match.group(1) if match else ""


def extract_list(text: str, label: str) -> List[str]:
    match = re.search(rf"{label}\s*[:：]\s*([\d\s\-－–—]+)", text, flags=re.IGNORECASE)
    if not match:
        return []
    return [item for item in re.split(r"[\s\-－–—]+", match.group(1).strip()) if item]


def parse_version_text(raw: str) -> dict:
    normalized = (raw or "").replace("，", " ").replace(",", " ")
    return {
        "merged_p4_head": extract_number(normalized, "MergedP4Head"),
        "merged_svn_head": extract_number(normalized, "MergedSvnHead"),
        "p4_merge": extract_list(normalized, "P4Merge"),
        "svn_merge": extract_list(normalized, "SVNMerge"),
    }


def render_command(args: Sequence[str]) -> str:
    def quote(value: str) -> str:
        text = str(value)
        if not text:
            return '""'
        if re.search(r'[\s"&|<>^]', text):
            return f'"{text.replace(chr(34), chr(92) + chr(34))}"'
        return text

    return " ".join(quote(item) for item in args)


def run_command(args: Sequence[str], dry_run: bool, capture_stdout: bool = False) -> subprocess.CompletedProcess:
    if dry_run:
        print(f"[dry-run] {render_command(args)}", flush=True)
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    print(f"[version] {render_command(args)}", flush=True)
    return subprocess.run(
        list(args),
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture_stdout else None,
        stderr=subprocess.PIPE if capture_stdout else None,
    )


def run_checked(args: Sequence[str], dry_run: bool) -> None:
    completed = run_command(args, dry_run)
    if completed.returncode != 0:
        raise RuntimeError(f"command failed with exitCode={completed.returncode}: {render_command(args)}")


def p4_specs(paths: Iterable[str], revision: str, exact_change: bool = False) -> List[str]:
    suffix = f"\\...@{'=' if exact_change else ''}{revision}"
    return [f"{path}{suffix}" for path in paths]


def p4_revert_specs(paths: Iterable[str]) -> List[str]:
    return [f"{path}\\..." for path in paths]


def sync_p4_many(specs: Iterable[str], label: str, parallel: bool, dry_run: bool) -> None:
    sync_specs = list(specs)
    if not sync_specs:
        return

    print(f"[version] P4 {label}: {len(sync_specs)} target(s)", flush=True)
    if dry_run or not parallel or len(sync_specs) == 1:
        for spec in sync_specs:
            run_checked(["p4", "sync", spec], dry_run)
        return

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(sync_specs)) as executor:
        futures = [executor.submit(run_checked, ["p4", "sync", spec], False) for spec in sync_specs]
        for future in concurrent.futures.as_completed(futures):
            future.result()


def update_p4(version_info: dict, p4_paths: List[str], parallel: bool, dry_run: bool) -> int:
    merged_p4_head = version_info["merged_p4_head"]
    p4_merge = version_info["p4_merge"]
    if not merged_p4_head and not p4_merge:
        print("[version] No P4 asset revisions found; skipping.", flush=True)
        return 0
    if not p4_paths:
        print("[version] No P4 safe sync paths were provided.", file=sys.stderr, flush=True)
        return 1

    try:
        for spec in p4_revert_specs(p4_paths):
            run_checked(["p4", "revert", spec], dry_run)
        if merged_p4_head:
            sync_p4_many(p4_specs(p4_paths, merged_p4_head), f"base @{merged_p4_head}", parallel, dry_run)
        for revision in p4_merge:
            sync_p4_many(p4_specs(p4_paths, revision, exact_change=True), f"merge @={revision}", parallel, dry_run)
    except Exception as exc:
        print(f"[version] {exc}", file=sys.stderr, flush=True)
        return 1
    return 0


def resolve_svn_source_url(svn_path: str, dry_run: bool) -> str:
    completed = run_command(["svn", "info", "--show-item", "url", svn_path], False, capture_stdout=True)
    if completed.returncode != 0:
        if dry_run:
            return svn_path
        stderr = (completed.stderr or "").strip()
        raise RuntimeError(f"failed to resolve SVN URL from working copy: {stderr}")
    url = (completed.stdout or "").strip()
    if not url:
        raise RuntimeError(f"failed to resolve SVN URL from working copy: {svn_path}")
    return url


def svn_revision_touches_url(source_url: str, revision: str) -> bool:
    completed = run_command(["svn", "log", "-q", "-r", revision, source_url], False, capture_stdout=True)
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        raise RuntimeError(f"failed to inspect SVN revision {revision}: {stderr}")
    return re.search(rf"^r{re.escape(revision)}\s+\|", completed.stdout or "", flags=re.MULTILINE) is not None


def update_svn(version_info: dict, svn_paths: List[str], dry_run: bool) -> int:
    merged_svn_head = version_info["merged_svn_head"]
    svn_merge = version_info["svn_merge"]
    if not merged_svn_head and not svn_merge:
        print("[version] No SVN revisions found; skipping.", flush=True)
        return 0
    if not svn_paths:
        print("[version] No SVN update path was provided.", file=sys.stderr, flush=True)
        return 1

    try:
        for svn_path in svn_paths:
            run_checked(["svn", "revert", "--depth", "infinity", svn_path], dry_run)
            if merged_svn_head:
                run_checked(["svn", "update", "-r", merged_svn_head, svn_path, "--non-interactive"], dry_run)

        svn_sources = [(svn_path, resolve_svn_source_url(svn_path, dry_run)) for svn_path in svn_paths] if svn_merge else []
        for revision in svn_merge:
            merged_any = False
            for svn_path, svn_source_url in svn_sources:
                can_inspect_revision = not dry_run or svn_source_url != svn_path
                if can_inspect_revision and not svn_revision_touches_url(svn_source_url, revision):
                    continue
                run_checked(["svn", "merge", "-c", revision, svn_source_url, svn_path, "--non-interactive"], dry_run)
                merged_any = True
            if not merged_any:
                print(f"[version] SVN merge r{revision} skipped: no changes under configured SVN paths", flush=True)
    except Exception as exc:
        print(f"[version] {exc}", file=sys.stderr, flush=True)
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Update code/assets from version handoff text.")
    parser.add_argument("--step", choices=["p4", "svn"], required=True)
    parser.add_argument("--version-text", default="")
    parser.add_argument("--svn-update-path", default="")
    parser.add_argument("--svn-update-paths-json", default="")
    parser.add_argument("--p4-sync-paths-json", default="[]")
    parser.add_argument("--parallel", choices=["true", "false"], default="true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        version_info = parse_version_text(args.version_text)
        p4_paths = parse_json_list(args.p4_sync_paths_json)
        svn_paths = parse_json_list(args.svn_update_paths_json) or ([args.svn_update_path] if args.svn_update_path else [])
    except ValueError as exc:
        print(f"[version] {exc}", file=sys.stderr, flush=True)
        return 1

    if args.step == "p4":
        return update_p4(version_info, p4_paths, args.parallel == "true", args.dry_run)
    return update_svn(version_info, svn_paths, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
