#!/usr/bin/env python3
"""Validate relative links in content docs.

- relative .md links must resolve to an existing doc
- relative media paths must resolve to an existing file
Prints broken links grouped by file.

Usage: python src/content/normalize/check-links.py [--root src/content/normalize]
"""

import argparse
import os
import re

TARGET_RE = re.compile(r"\]\s*\(([^)]+)\)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Check relative links in markdown docs.")
    parser.add_argument("--root", default="src/content/normalize")
    args = parser.parse_args()
    root = os.path.abspath(args.root)

    broken: dict[str, list[tuple[str, int | None]]] = {}
    total_links = 0
    for current, _dirs, files in os.walk(root):
        for fn in sorted(files):
            if not fn.endswith(".md") or fn in ("index.md", "AGENTS.md"):
                continue
            path = os.path.join(current, fn)
            txt = open(path, encoding="utf-8", errors="replace").read()
            txt = re.sub(r"`[^`]*`", "", txt)
            targets = [m.group(1) for m in TARGET_RE.finditer(txt)]
            for target in targets:
                tgt = target.strip().replace("\\", "/")
                if tgt.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:", "<", "/")):
                    continue
                alvo = os.path.normpath(os.path.join(current, tgt))
                total_links += 1
                if not os.path.exists(alvo):
                    broken.setdefault(os.path.relpath(path, root), []).append((tgt, None))
    print("total relative links checked:", total_links)
    n = 0
    for rel, links in sorted(broken.items()):
        for link in sorted(set(links)):
            n += 1
            print("BROKEN %s -> %s%s" % (rel, link[0], " (line %d)" % link[1] if link[1] else ""))
    print("broken links:", n)


if __name__ == "__main__":
    main()
