"""Developer preview; never starts network workers or writes source data."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app  # Initialize the same DPI awareness as the actual display.
import tkinter as tk
from models import Snapshot
from ui.dashboard import Dashboard

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--feed')
parser.add_argument('--output', required=True)
parser.add_argument('--width',type=int,default=1920)
parser.add_argument('--height',type=int,default=1080)
args=parser.parse_args()
root=tk.Tk()
root.overrideredirect(True)
root.attributes('-topmost',True)
root.geometry(f'{args.width}x{args.height}+0+0')
dashboard=Dashboard(root)
root.update()
if args.feed:
    dashboard.growth_feed.load(args.feed)
payload=json.loads((Path(__file__).resolve().parents[1]/'data/demo_snapshot.json').read_text(encoding='utf-8'))
dashboard.update_data(Snapshot.from_payload(payload),{},datetime.now(timezone.utc),False,'PREVIEW')
dashboard.create_text(args.width/2,args.height*.072,text='Business data: demo • Social: server projection' if args.feed else 'Preview • demo business data',fill='#AAAAAA',font=('Arial',-12))
root.update()
time.sleep(.3)
from PIL import ImageGrab
x,y=root.winfo_rootx(),root.winfo_rooty()
ImageGrab.grab(bbox=(x,y,x+args.width,y+args.height)).save(args.output)
root.destroy()
