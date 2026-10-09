from datetime import datetime as RealDatetime, timezone
import os
from pathlib import Path
import subprocess
import sys

import pytest

yaml = pytest.importorskip('yaml')
ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.safe_load((ROOT / '.github/workflows/x_post.yml').read_text(encoding='utf-8'))
STEPS = WORKFLOW['jobs']['data-pipeline']['steps']
BY_ID = {s['id']: s for s in STEPS if 'id' in s}


def test_schedule_permissions_and_steps():
    # PyYAML の YAML 1.1 loader は on を True と読む。
    trigger = WORKFLOW.get('on', WORKFLOW.get(True))
    assert [s['cron'] for s in trigger['schedule']] == ['47 0 * * *', '7 4 * * 5']
    assert set(trigger['workflow_dispatch']['inputs']) == {'mode', 'as_of', 'dry_run'}
    assert WORKFLOW['permissions']['actions'] == 'read'
    assert WORKFLOW['concurrency'] == {'group': 'dabimas-data-update', 'cancel-in-progress': False}
    assert WORKFLOW['jobs']['data-pipeline']['timeout-minutes'] == 360
    assert not any(s.get('uses', '').startswith('actions/cache') for s in STEPS)
    assert not any('latest_news' in s.get('run', '') or 'no-change' in s.get('name', '') for s in STEPS)
    assert all('${{' not in s.get('run', '') for s in STEPS)
    assert 'dry_run' in BY_ID['push']['if']
    assert 'push.outcome' in BY_ID['post_update']['if']
    assert 'err_gate' in BY_ID['post_error']['if'] and 'failure()' in BY_ID['post_error']['if']
    gate = BY_ID['err_gate']['if']
    assert all(text in gate for text in ["failure()", "steps.deps.outcome == 'success'",
                                       "steps.push.outcome != 'success'", "steps.ctx.outputs.dry_run != 'true'"])


def run_context(tmp_path, monkeypatch, event='schedule', schedule='47 0 * * *', mode='daily', as_of='', dry_run='false'):
    values = dict(EVENT_NAME=event, SCHEDULE=schedule, INPUT_MODE=mode, INPUT_AS_OF=as_of,
                  INPUT_DRY_RUN=dry_run, GITHUB_OUTPUT=str(tmp_path / 'output'))
    for key, value in values.items(): monkeypatch.setenv(key, value)
    import datetime
    class Clock(RealDatetime):
        @classmethod
        def now(cls, tz=None):
            # 日次目標を35分過ぎて開始しても、as_ofは11:30。
            return cls(2026, 10, 13, 3, 5, tzinfo=timezone.utc).astimezone(tz)
    monkeypatch.setattr(datetime, 'datetime', Clock)
    script = BY_ID['ctx']['run'].split("python - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
    exec(compile(script, '<workflow ctx>', 'exec'), {})
    return dict(line.split('=', 1) for line in (tmp_path / 'output').read_text(encoding='utf-8').splitlines())


@pytest.mark.parametrize('schedule,mode,time', [('47 0 * * *', 'daily', '11:30'), ('7 4 * * 5', 'weekly', '18:30')])
def test_scheduled_as_of_is_fixed(tmp_path, monkeypatch, schedule, mode, time):
    out = run_context(tmp_path, monkeypatch, schedule=schedule)
    assert out == {'mode': mode, 'dry_run': 'false', 'as_of': f'2026-10-13T{time}:00+09:00', 'wait': time}


def test_manual_future_requires_dry_run(tmp_path, monkeypatch):
    with pytest.raises(SystemExit, match='Future'):
        run_context(tmp_path, monkeypatch, event='workflow_dispatch', as_of='2030-01-01T00:00:00+09:00')
    out = run_context(tmp_path, monkeypatch, event='workflow_dispatch', as_of='2030-01-01T00:00:00+09:00', dry_run='true')
    assert out['dry_run'] == 'true' and out['wait'] == ''


def test_manual_default_and_invalid_timezone(tmp_path, monkeypatch):
    out = run_context(tmp_path, monkeypatch, event='workflow_dispatch', mode='weekly')
    assert out['as_of'] == '2026-10-13T12:05:00+09:00' and out['mode'] == 'weekly'
    with pytest.raises(SystemExit, match='timezone'):
        run_context(tmp_path, monkeypatch, event='workflow_dispatch', as_of='2026-10-13T11:30:00')


def test_image_with_forty_lines(tmp_path):
    path = tmp_path / 'lines.txt'
    path.write_text('【追加 39頭】\n' + '\n'.join(f'★5 テスト種牡馬{i}-央瓏-' for i in range(39)), encoding='utf-8')
    image = tmp_path / 'summary.png'
    result = subprocess.run([sys.executable, str(ROOT / 'scripts/txt_to_png.py'), '--input', str(path),
                             '--output', str(image), '--font-path', str(ROOT / 'fonts/NotoSansCJKjp-Regular.otf'),
                             '--title', 'ダビふぁく 更新内容 2026-10-13'], capture_output=True)
    assert result.returncode == 0, result.stderr
    assert image.read_bytes().startswith(b'\x89PNG') and image.stat().st_size < 5_000_000
