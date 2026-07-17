---
name: looper-api
description: Manage Looper projects and tickets through its authenticated HTTP API. Use when asked to create, rename, or delete a Looper project, or to create, update, complete, reopen, or delete a Looper ticket.
---

# Looper API

Use the bundled client for every project or ticket write. Do not edit application source or database files to fulfill a data-management request.

## 1. Resolve the operation

Collect the fields required by one command:

- Project create: name; derive a lowercase hyphenated slug when omitted.
- Project rename: existing slug and new name.
- Project delete: existing slug. Confirm destructive intent when it is not explicit; deletion also removes every ticket in the project.
- Ticket create: project slug, unique key, title. Default status to `open` and description to empty when omitted.
- Ticket update: project slug, key, and at least one of title, status, or description.
- Ticket delete: project slug and key. Confirm destructive intent when it is not explicit.

Statuses are `open`, `in_progress`, `in_review`, `needs_human`, and `done`. Ask only for required information that cannot be derived unambiguously. This step is complete when exactly one command and its complete payload are known.

## 2. Send the request

From any directory inside this repository, run the matching command:

```sh
# Projects
python3 .pi/skills/looper-api/scripts/request.py project create --slug ops --name "Operations"
python3 .pi/skills/looper-api/scripts/request.py project rename --slug ops --name "Platform Operations"
python3 .pi/skills/looper-api/scripts/request.py project delete --slug ops

# Tickets
python3 .pi/skills/looper-api/scripts/request.py ticket create \
  --project looper --key LOOP-7 --title "Describe the work" \
  --status open --description "Readable ticket details."
python3 .pi/skills/looper-api/scripts/request.py ticket update \
  --project looper --key LOOP-7 --status done
python3 .pi/skills/looper-api/scripts/request.py ticket delete \
  --project looper --key LOOP-7
```

The client reads `INGEST_TOKEN` from the gitignored `.env.lakebed.server` and defaults to `https://looper.lakebed.app`. Never print, paste, commit, or return the token. This step is complete when the command returns a successful JSON response containing `"ok": true`.

## 3. Resolve failures

On a non-success response, use its status and message to correct the request once. Do not retry an unchanged destructive request. For field limits, response codes, and API behavior, consult the `Incremental project CRUD`, `Incremental ticket CRUD`, and `Response codes and recovery` sections of [`README.md`](../../../README.md).

This step is complete when the API confirms the intended write or the user receives the exact blocking response without any credential disclosure.

## 4. Report

State the entity and operation completed, including project slug and ticket key where applicable. Do not include credentials or environment contents.
