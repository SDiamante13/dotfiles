#!/usr/bin/env python3
"""Build a Slack digest of a team's open GitLab MRs.

Queries open MRs per author across ALL gitlab.com projects (scope=all) so MRs
outside any single group are still caught, then formats Slack mrkdwn sorted
oldest-first (stale MRs surface at the top). Prints the message to stdout —
posting is deliberately left to the caller so a human can confirm first.

Config: scripts/config.json  -> { "team_label", "channel", "authors": [...] }
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def fetch_author_mrs(username):
    path = f"merge_requests?author_username={username}&state=opened&scope=all&per_page=100"
    out = subprocess.run(["glab", "api", path], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def fetch_open_mrs(authors):
    mrs = []
    for username in authors:
        mrs.extend(fetch_author_mrs(username))
    return mrs


def age_days(created_at):
    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - created).days


def format_mr(mr):
    draft = "🚧 " if mr.get("draft") else ""
    age = age_days(mr["created_at"])
    return f"• {draft}<{mr['web_url']}|{mr['title']}> — _{mr['author']['username']}_, {age}d"


def build_message(mrs, team_label):
    if not mrs:
        return f"*Open MRs — {team_label}*\n\n:white_check_mark: No open MRs."
    by_age = sorted(mrs, key=lambda m: age_days(m["created_at"]), reverse=True)
    header = f"*Open MRs — {team_label} ({len(mrs)})* · oldest first"
    return "\n".join([header, "", *[format_mr(m) for m in by_age]])


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--channel",
        help="override the target channel (default: 'channel' in config.json)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    config = load_config()
    target = args.channel or config["channel"]
    message = build_message(fetch_open_mrs(config["authors"]), config["team_label"])
    print(f"target channel: {target}", file=sys.stderr)
    print(message)


if __name__ == "__main__":
    main()
