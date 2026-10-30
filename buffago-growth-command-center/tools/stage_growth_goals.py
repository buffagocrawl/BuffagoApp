"""Merge only the Growth & Goals hooks into a downloaded installed Pi tree."""
import ast
import copy
from pathlib import Path
import shutil


def methods(source, name):
    tree = ast.parse(source)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == name)
    return {n.name: n for n in cls.body if isinstance(n, ast.FunctionDef)}


def merge_dashboard(installed, reference):
    old, new = methods(installed, 'Dashboard'), methods(reference, 'Dashboard')
    for name in ('_draw_tiles','_draw_actions','_draw_activity','_draw_header'):
        if ast.dump(old[name], include_attributes=False) != ast.dump(new[name], include_attributes=False):
            raise ValueError('Installed left panel differs; manual review required: '+name)
    normalized = copy.deepcopy(new['_draw_charts'])
    for node in ast.walk(normalized):
        if isinstance(node, ast.For):
            node.body = [n for n in node.body if not (isinstance(n,ast.If) and
                ast.dump(n.test) == ast.dump(ast.parse("field == 'unique_devices'",mode='eval').body))]
    if ast.dump(old['_draw_charts'],include_attributes=False) not in (
        ast.dump(new['_draw_charts'],include_attributes=False),ast.dump(normalized,include_attributes=False)):
        raise ValueError('Installed business charts differ beyond the requested replacement')
    lines = installed.splitlines(keepends=True)
    source = reference.splitlines(keepends=True)
    for name in sorted(('__init__','render','_draw_mini_chart','_draw_charts'), key=lambda n: old[n].lineno, reverse=True):
        a,b = old[name],new[name]
        lines[a.lineno-1:a.end_lineno] = source[b.lineno-1:b.end_lineno]
    merged = ''.join(lines)
    if 'from growth_goals import PanelFeed' not in merged:
        merged = merged.replace('from ui import theme\n',
            'from ui import theme\nfrom growth_goals import PanelFeed\nfrom ui.growth_goals_panel import draw as draw_growth_goals, business_painter\n', 1)
    if 'from ui.weekly_instagram' not in merged:
        merged = merged.replace('from ui import theme\n','from ui import theme\nfrom ui.weekly_instagram import draw as draw_weekly_instagram\n',1)
    compile(merged, '<merged dashboard>', 'exec')
    return merged


def merge_app(installed):
    method = ('    def _refresh_growth_goals(self):\n'
              '        self.dashboard.growth_feed.load(self._growth_path, self.config.cache_path.parent / "state-goals.json")\n'
              '        self.dashboard.render()\n'
              '        self.root.after(60_000, self._refresh_growth_goals)\n\n')
    existing = methods(installed, 'Application')
    if '_refresh_growth_goals' in existing:
        node = existing['_refresh_growth_goals']
        lines = installed.splitlines(keepends=True)
        lines[node.lineno-1:node.end_lineno] = [method]
        merged = ''.join(lines)
        compile(merged, '<merged app>', 'exec')
        return merged
    anchor = '        self._load_initial_state()\n'
    if installed.count(anchor) != 1 or '_refresh_growth_goals' in installed:
        raise ValueError('Unexpected installed app hooks')
    merged = installed.replace(anchor, anchor+
        '        self._growth_path = Path(os.getenv("BUFFAGO_GROWTH_GOALS_PATH", config.cache_path.parent / "growth-goals.json"))\n'
        '        self.root.after(200, self._refresh_growth_goals)\n', 1)
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
    for name in ('growth_goals.py','ui/growth_goals_panel.py','ui/weekly_instagram.py','state_goal_config.py','adapters/pull_feed.py'):
        shutil.copyfile(reference/name, target/name)
