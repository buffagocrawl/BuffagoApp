"""Merge only the Growth & Goals hooks into a downloaded installed Pi tree."""
import ast
from pathlib import Path
import shutil


def methods(source, name):
    tree = ast.parse(source)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == name)
    return {n.name: n for n in cls.body if isinstance(n, ast.FunctionDef)}


def merge_dashboard(installed, reference):
    old, new = methods(installed, 'Dashboard'), methods(reference, 'Dashboard')
    for name in ('_draw_tiles','_draw_charts','_draw_actions','_draw_activity','_draw_header'):
        if ast.dump(old[name], include_attributes=False) != ast.dump(new[name], include_attributes=False):
            raise ValueError('Installed left panel differs; manual review required: '+name)
    lines = installed.splitlines(keepends=True)
    source = reference.splitlines(keepends=True)
    for name in sorted(('__init__','render','_draw_mini_chart'), key=lambda n: old[n].lineno, reverse=True):
        a,b = old[name],new[name]
        lines[a.lineno-1:a.end_lineno] = source[b.lineno-1:b.end_lineno]
    merged = ''.join(lines).replace('from ui import theme\n',
        'from ui import theme\nfrom growth_goals import PanelFeed\nfrom ui.growth_goals_panel import draw as draw_growth_goals, business_painter\n', 1)
    compile(merged, '<merged dashboard>', 'exec')
    return merged


def merge_app(installed):
    anchor = '        self._load_initial_state()\n'
    if installed.count(anchor) != 1 or '_refresh_growth_goals' in installed:
        raise ValueError('Unexpected installed app hooks')
    merged = installed.replace(anchor, anchor+
        '        self._growth_path = Path(os.getenv("BUFFAGO_GROWTH_GOALS_PATH", config.cache_path.parent / "growth-goals.json"))\n'
        '        self.root.after(200, self._refresh_growth_goals)\n', 1)
    method = ('    def _refresh_growth_goals(self):\n'
              '        self.dashboard.growth_feed.load(self._growth_path)\n'
              '        self.dashboard.render()\n'
              '        self.root.after(60_000, self._refresh_growth_goals)\n\n')
    merged = merged.replace('    def _leave_fullscreen(', method+'    def _leave_fullscreen(', 1)
    compile(merged, '<merged app>', 'exec')
    return merged


def stage(installed, reference, target):
    installed, reference, target = map(Path, (installed, reference, target))
    (target/'ui').mkdir(parents=True, exist_ok=True)
    (target/'adapters').mkdir(exist_ok=True)
    (target/'app.py').write_text(merge_app((installed/'app.py').read_text(encoding='utf-8')), encoding='utf-8')
    (target/'ui/dashboard.py').write_text(merge_dashboard((installed/'ui/dashboard.py').read_text(encoding='utf-8'),
        (reference/'ui/dashboard.py').read_text(encoding='utf-8')), encoding='utf-8')
    for name in ('growth_goals.py','ui/growth_goals_panel.py','adapters/receive_growth.py'):
        shutil.copyfile(reference/name, target/name)
