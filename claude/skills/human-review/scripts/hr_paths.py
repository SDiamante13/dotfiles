"""Where the run's working files live.

A review writes a lot: the extracted passes, the assets every producer emits, the step
ledger, content.json and the built page. All of it is scratch — it is rebuilt from the
branch on the next run and the wrap-up tells the human to delete it.

It used to be written to `.human-review/` in the repository being reviewed, which is the
one place it should not go. The repo under review is usually shared and often somebody
else's branch, so the review left an untracked directory in a working tree the reviewer
did not own; on a repo whose .gitignore does not know about it, `git status` grows a
stray entry, and `git clean -fd` during the review silently destroys the run. Nothing
about the artifacts wants to be in the tree — no producer reads them back through git,
and the page inlines everything it needs.

So the default is now a cache directory keyed by repo and branch, which also means two
branches of the same repo no longer overwrite each other's run.

Resolution order, most explicit first:

1. ``$HUMAN_REVIEW_DIR`` — an explicit choice always wins, and is what CI should set.
2. ``./.human-review`` **if it already exists** — an in-progress run started under the old
   layout keeps working, and the test suite, which creates that directory in a temporary
   cwd, keeps finding it. This is compatibility, not preference: nothing creates it here.
3. ``$XDG_CACHE_HOME/human-review/<repo>/<branch>`` (or ``~/.cache/...``) — the default.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

LEGACY = ".human-review"


def _git(*args: str) -> str:
    try:
        r = subprocess.run(("git", *args), capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ""
    return r.stdout.strip() if r.returncode == 0 else ""


def _slug(value: str, fallback: str) -> str:
    """One path segment. Branch names carry slashes (`feature/x`) and the odd character a
    filesystem would rather not see, and a slug collision is harmless here — the contents
    are rebuilt on every run."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-.")
    return cleaned[:80] or fallback


def cache_root() -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or (Path.home() / ".cache")
    return Path(base) / "human-review"


_resolved: Path | None = None


def review_dir(create: bool = False) -> Path:
    """The directory this run reads and writes. See the module docstring for the order.

    Resolved once per process and remembered. One run means one directory, so re-deriving
    it per call could only ever return the same answer more expensively — and it asks git
    two questions to do so, which a caller in a loop pays for repeatedly and a test that
    watches subprocess calls sees as noise it did not make.
    """
    global _resolved
    if _resolved is not None:
        if create:
            _resolved.mkdir(parents=True, exist_ok=True)
        return _resolved
    override = os.environ.get("HUMAN_REVIEW_DIR")
    if override:
        d = Path(override).expanduser()
    elif Path(LEGACY).is_dir():
        d = Path(LEGACY)
    else:
        top = _git("rev-parse", "--show-toplevel")
        repo = _slug(Path(top).name if top else Path.cwd().name, "repo")
        branch = _slug(_git("rev-parse", "--abbrev-ref", "HEAD"), "detached")
        d = cache_root() / repo / branch
    _resolved = d
    if create:
        d.mkdir(parents=True, exist_ok=True)
    return d


def assets_dir(create: bool = False) -> Path:
    d = review_dir(create=create) / "assets"
    if create:
        d.mkdir(parents=True, exist_ok=True)
    return d
