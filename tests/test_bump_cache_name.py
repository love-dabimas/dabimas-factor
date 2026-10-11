from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from bump_cache_name import bump


@pytest.mark.parametrize('prior,expected', [('dabimas-factor-v20261002-01', '02'), ('dabimas-factor-v20261002-09', '10'),
                                          ('dabimas-factor-v20261001-05', '01'), ('old', '01')])
def test_sequence_and_bytes(tmp_path, prior, expected):
    path = tmp_path / 'service-worker.js'
    data = b'// test\r\n' + f"var CACHE_NAME = '{prior}';\r\n".encode() + '// 日本語\n'.encode()
    path.write_bytes(data)
    name = bump(path, '20261002', dry_run=True)
    assert path.read_bytes() == data
    assert name == f'dabimas-factor-v20261002-{expected}'
    bump(path, '20261002')
    assert path.read_bytes() == data.replace(prior.encode(), name.encode())


def test_missing_cache_line(tmp_path):
    path = tmp_path / 'sw.js'
    path.write_bytes(b'no name')
    with pytest.raises(ValueError): bump(path, '20261002')
