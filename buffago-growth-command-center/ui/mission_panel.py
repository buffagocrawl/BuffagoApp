"""Compact mission details with explicit, local manual confirmations."""
import tkinter as tk
from tkinter import messagebox
from datetime import date, timedelta
from dataclasses import replace
from missions import eastern_day, mission_for, goal_contribution
from ui import theme


def open_mission(dashboard, day=None):
    day = day or eastern_day()
    mission = mission_for(day, dashboard.snapshot)
    store = dashboard.mission_store
    record = store.records().get(day.isoformat())
    if record:
        mission = replace(mission, theme=record['theme'], topic=record['topic'])
    window = tk.Toplevel(dashboard)
    window.title("Today's Marketing Mission")
    window.configure(bg=theme.BG)
    window.geometry(f"{min(620, window.winfo_screenwidth()-40)}x{min(680, window.winfo_screenheight()-80)}")
    window.transient(dashboard.winfo_toplevel())
    window.attributes('-topmost', True)
    window.bind('<Escape>', lambda event: window.destroy())
    body = tk.Text(window, wrap='word', height=1, width=1, bg=theme.PANEL, fg=theme.TEXT,
                   relief='flat', padx=16, pady=12, font=('Arial', 11))
    scroll = tk.Scrollbar(window, command=body.yview)
    scroll.pack(side='right', fill='y')
    body.configure(yscrollcommand=scroll.set)
    body.pack(fill='both', expand=True)
    state = dashboard.snapshot.growth_os.with_local_fallbacks(dashboard.local) if dashboard.snapshot else None
    goal = state.current_experiment if state else None
    details = [day.strftime('%A, %B %d, %Y') + ' · America/New_York', mission.theme,
               mission.topic, 'Instagram + Facebook · about %s minutes' % mission.minutes,
               'What to post\n' + mission.what, 'Create it manually\n' + mission.instructions,
               'Why it could help\n' + mission.why, 'Evaluate\n' + mission.result,
               'Engagement question\n' + mission.question, 'Evidence\n' + mission.context,
               goal_contribution(goal.title if goal else None),
               ('Owner confirmed: ' + ', '.join(record['platforms']) + '\n' + record['completed_at']) if record else 'Not yet confirmed']
    body.insert('end', '\n\n'.join(details))
    body.configure(state='disabled')
    controls = tk.Frame(window, bg=theme.BG)
    controls.pack(fill='x', padx=12, pady=8)
    platforms_row = tk.Frame(controls, bg=theme.BG)
    platforms_row.pack(fill='x')
    actions_row = tk.Frame(controls, bg=theme.BG)
    actions_row.pack(fill='x')
    choices = {}
    for platform in ('Instagram', 'Facebook'):
        value = tk.BooleanVar(value=bool(record and platform in record['platforms']))
        choices[platform] = value
        tk.Checkbutton(platforms_row, text=platform, variable=value, bg=theme.BG,
                       fg=theme.TEXT, selectcolor=theme.PANEL, activebackground=theme.BG).pack(side='left')

    def save(undo=False):
        try:
            if undo:
                store.undo(day)
            else:
                store.complete(mission, [p for p, v in choices.items() if v.get()])
        except (OSError, ValueError) as error:
            messagebox.showerror('Confirmation not saved', str(error), parent=window)
            return
        dashboard.render()
        window.destroy()
        open_mission(dashboard, day)

    tk.Button(actions_row, text='Correct confirmation' if record else 'Mark as Posted',
              command=save, bg=theme.ACCENT).pack(side='right')
    if record:
        tk.Button(actions_row, text='Undo', command=lambda: save(True)).pack(side='right')
    overview = tk.Frame(window, bg=theme.BG)
    overview.pack(fill='x', padx=12, pady=6)
    expanded = tk.Frame(window, bg=theme.BG)

    def show(history=False):
        if expanded.winfo_manager():
            expanded.pack_forget()
            return
        for child in expanded.winfo_children():
            child.destroy()
        expanded.pack(fill='x', padx=12, pady=6)
        records = store.records()
        monday = day - timedelta(days=day.weekday())
        days = [date.fromisoformat(key) for key in sorted(records, reverse=True)] if history else [monday + timedelta(days=i) for i in range(7)]
        # Scrollable text keeps even years of completed missions compact.
        listing = tk.Text(expanded, height=7, wrap='word', bg=theme.PANEL, fg=theme.TEXT)
        listing.pack(fill='x')
        for index, item in enumerate(days):
            planned = mission_for(item, dashboard.snapshot)
            saved = records.get(item.isoformat())
            text = f"{item:%a %b %d} · {saved['theme'] if saved else planned.theme} · {saved['topic'] if saved else planned.topic} · {'Confirmed: ' + ', '.join(saved['platforms']) if saved else 'Pending'}\n"
            listing.insert('end', text, f'day{index}')
            listing.tag_bind(f'day{index}', '<Button-1>', lambda event, selected=item: (window.destroy(), open_mission(dashboard, selected)))
        if not days:
            listing.insert('end', 'No completed missions yet.')
        listing.configure(state='disabled')

    tk.Button(overview, text='Weekly overview ▾', command=show).pack(side='left')
    tk.Button(overview, text='Completed history ▾', command=lambda: show(True)).pack(side='left')
    tk.Label(window, text=f'{store.progress(day)} of 7 posting days completed', bg=theme.BG, fg=theme.MUTED).pack(fill='x')
