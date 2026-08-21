#!/usr/bin/env python3
"""
Read a JSON file whose top-level object contains a "result" array, call a GET
API once per result item using its taskId, and output the enriched array.

Example:
  python enrich_task_scores.py input.json \
    --url-template "https://api.example.com/tasks/{taskId}/score" \
    --output enriched_result.json
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def parse_headers(raw_headers: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for raw_header in raw_headers:
        if ":" not in raw_header:
            raise ValueError(f"Invalid header {raw_header!r}; expected 'Name: value'.")

        name, value = raw_header.split(":", 1)
        headers[name.strip()] = value.strip()

    return headers


def build_url(url_template: str, task_id: Any) -> str:
    encoded_task_id = quote(str(task_id), safe="")

    if "{taskId}" in url_template:
        return url_template.replace("{taskId}", encoded_task_id)

    if "{task_id}" in url_template:
        return url_template.replace("{task_id}", encoded_task_id)

    return f"{url_template.rstrip('/')}/{encoded_task_id}"


def get_json(url: str, headers: dict[str, str], timeout: float) -> Any:
    request = Request(url=url, headers=headers, method="GET")

    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GET {url} failed with HTTP {exc.code}: {message}") from exc
    except URLError as exc:
        raise RuntimeError(f"GET {url} failed: {exc.reason}") from exc

    try:
        return json.loads(body.decode(charset))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GET {url} did not return valid JSON: {exc}") from exc


def enrich_item(
    index: int,
    item: Any,
    url_template: str,
    headers: dict[str, str],
    timeout: float,
) -> tuple[int, dict[str, Any]]:
    if not isinstance(item, dict):
        raise TypeError(f"result[{index}] must be an object, got {type(item).__name__}.")

    if "taskId" not in item:
        raise KeyError(f"result[{index}] is missing required key 'taskId'.")

    score_json = get_json(build_url(url_template, item["taskId"]), headers, timeout)
    enriched = dict(item)
    enriched["scoreJson"] = score_json
    return index, enriched


def enrich_result_array(
    source: dict[str, Any],
    url_template: str,
    headers: dict[str, str],
    timeout: float,
    workers: int,
) -> list[dict[str, Any]]:
    result = source.get("result")
    if not isinstance(result, list):
        raise TypeError("Input JSON must be an object with a 'result' array.")

    enriched: list[dict[str, Any] | None] = [None] * len(result)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(enrich_item, index, item, url_template, headers, timeout)
            for index, item in enumerate(result)
        ]

        for future in as_completed(futures):
            index, enriched_item = future.result()
            enriched[index] = enriched_item

    return [item for item in enriched if item is not None]


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise TypeError("Input JSON top level must be an object.")

    return data


def write_json(data: Any, output_path: Path | None) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)

    if output_path is None:
        print(text)
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Call a GET API for every item in input.result using taskId, "
            "then output the enriched result array."
        )
    )
    parser.add_argument("input", type=Path, help="Path to the input JSON file.")
    parser.add_argument(
        "--url-template",
        required=True,
        help=(
            "GET URL template. Use {taskId}, for example "
            "'https://api.example.com/tasks/{taskId}/score'. If no placeholder "
            "is present, '/<taskId>' is appended."
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Optional output JSON file. If omitted, the array is printed to stdout.",
    )
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="Optional request header, such as 'Authorization: Bearer xxx'. Repeatable.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Request timeout in seconds. Default: 30.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=5,
        help="Concurrent request count. Default: 5.",
    )

    args = parser.parse_args()

    if args.workers < 1:
        parser.error("--workers must be greater than 0.")

    try:
        headers = parse_headers(args.header)
        source = load_json(args.input)
        enriched = enrich_result_array(
            source=source,
            url_template=args.url_template,
            headers=headers,
            timeout=args.timeout,
            workers=args.workers,
        )
        write_json(enriched, args.output)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
