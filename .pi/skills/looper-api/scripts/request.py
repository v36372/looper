#!/usr/bin/env python3
"""Safe CLI for Looper's incremental project and ticket API."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://looper.lakebed.app"
STATUSES = ("open", "in_progress", "in_review", "needs_human", "done")


def repository_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not locate the Looper git repository.")


def ingest_token() -> str:
    env_path = repository_root() / ".env.lakebed.server"
    if not env_path.is_file():
        raise RuntimeError(f"Missing server environment file: {env_path}")

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "INGEST_TOKEN":
            token = value.strip().strip('"').strip("'")
            if token:
                return token

    raise RuntimeError("INGEST_TOKEN is missing from .env.lakebed.server.")


def request(method: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    base_url = os.environ.get("LOOPER_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    api_request = Request(
        f"{base_url}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {ingest_token()}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(api_request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(response_body)
            rendered = json.dumps(details, ensure_ascii=False)
        except json.JSONDecodeError:
            rendered = response_body or error.reason
        raise RuntimeError(f"Looper API returned HTTP {error.code}: {rendered}") from error
    except URLError as error:
        raise RuntimeError(f"Unable to reach Looper API: {error.reason}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("Looper API returned invalid JSON.") from error

    if not isinstance(result, dict) or result.get("ok") is not True:
        raise RuntimeError(f"Looper API did not confirm the write: {result!r}")
    return result


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Manage Looper projects and tickets.")
    resources = root.add_subparsers(dest="resource", required=True)

    project = resources.add_parser("project")
    project_actions = project.add_subparsers(dest="action", required=True)

    project_create = project_actions.add_parser("create")
    project_create.add_argument("--slug", required=True)
    project_create.add_argument("--name", required=True)

    project_rename = project_actions.add_parser("rename")
    project_rename.add_argument("--slug", required=True)
    project_rename.add_argument("--name", required=True)

    project_delete = project_actions.add_parser("delete")
    project_delete.add_argument("--slug", required=True)

    ticket = resources.add_parser("ticket")
    ticket_actions = ticket.add_subparsers(dest="action", required=True)

    ticket_create = ticket_actions.add_parser("create")
    ticket_create.add_argument("--project", required=True)
    ticket_create.add_argument("--key", required=True)
    ticket_create.add_argument("--title", required=True)
    ticket_create.add_argument("--status", choices=STATUSES, default="open")
    ticket_create.add_argument("--description", default="")

    ticket_update = ticket_actions.add_parser("update")
    ticket_update.add_argument("--project", required=True)
    ticket_update.add_argument("--key", required=True)
    ticket_update.add_argument("--title")
    ticket_update.add_argument("--status", choices=STATUSES)
    ticket_update.add_argument("--description")

    ticket_delete = ticket_actions.add_parser("delete")
    ticket_delete.add_argument("--project", required=True)
    ticket_delete.add_argument("--key", required=True)

    return root


def operation(args: argparse.Namespace) -> tuple[str, str, dict[str, Any]]:
    if args.resource == "project":
        payload = {"slug": args.slug}
        if args.action in {"create", "rename"}:
            payload["name"] = args.name
        methods = {"create": "POST", "rename": "PATCH", "delete": "DELETE"}
        return methods[args.action], "/api/v1/projects", payload

    payload = {"projectSlug": args.project, "key": args.key}
    if args.action == "create":
        payload.update(
            {
                "title": args.title,
                "status": args.status,
                "description": args.description,
            }
        )
        return "POST", "/api/v1/tickets", payload
    if args.action == "update":
        updates = {
            key: value
            for key, value in {
                "title": args.title,
                "status": args.status,
                "description": args.description,
            }.items()
            if value is not None
        }
        if not updates:
            raise RuntimeError(
                "Ticket update requires --title, --status, or --description."
            )
        payload.update(updates)
        return "PATCH", "/api/v1/tickets", payload
    return "DELETE", "/api/v1/tickets", payload


def main() -> int:
    try:
        args = parser().parse_args()
        method, path, payload = operation(args)
        result = request(method, path, payload)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
