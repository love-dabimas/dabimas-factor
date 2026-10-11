"""CACHE_NAME の同日連番を進める。他のバイトは変更しない。"""
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re


def bump(path, date, dry_run=False):
    datetime.strptime(date, '%Y%m%d')
    data = Path(path).read_bytes()
    matches = list(re.finditer(rb"(?m)^var CACHE_NAME = '([^'\r\n]*)';\r?$", data))
    if len(matches) != 1:
        raise ValueError('CACHE_NAME line must occur exactly once')
    match = matches[0]
    prior = re.fullmatch(rb'dabimas-factor-v' + date.encode('ascii') + rb'-(\d{2,})', match[1])
    sequence = int(prior[1]) + 1 if prior else 1
    name = f'dabimas-factor-v{date}-{sequence:02d}'
    if not dry_run:
        Path(path).write_bytes(data[:match.start(1)] + name.encode('ascii') + data[match.end(1):])
    return name


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=Path('service-worker.js'))
    parser.add_argument('--date', default=datetime.now(timezone(timedelta(hours=9))).strftime('%Y%m%d'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    try:
        print(bump(args.file, args.date, args.dry_run))
        return 0
    except (OSError, ValueError) as exc:
        print(f'[error] {exc}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
