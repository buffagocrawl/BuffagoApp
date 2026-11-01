"""Small Pi dispatcher: fixed Actions workflows only; never holds Meta keys."""
from datetime import datetime, timezone
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')
ORIGIN = 'https://api.github.com/repos/buffagocrawl/BuffagoApp/actions/workflows/'
PUBLISH = 'guess-wing-spot.yml'
METRICS = 'jalapeno-metrics.yml'
PUBLISH_SLOTS = {'19:30', '19:50', '20:10', '20:30', '20:50'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def due(now):
    local = now.astimezone(EASTERN)
    slot = local.strftime('%H:%M')
    tasks = []
    if slot in PUBLISH_SLOTS:
        tasks.append((PUBLISH, 'publish'))
    if slot in {'20:30', '21:10'}:
        tasks.append((METRICS, 'collect'))
    if slot in {'21:15', '21:45'}:
        tasks.append((PUBLISH, 'health'))
    return local.date().isoformat(), slot, tasks


def dispatch(now, token, state_dir, *, send=None, dry_run=False):
    if not token.startswith('github_pat_') or any(c.isspace() for c in token):
        raise ValueError('fine_grained_dispatch_credential_required')
    date, slot, tasks = due(now)
    send = send or (lambda request: build_opener(NoRedirect()).open(request, timeout=20))
    results = []
    for workflow, mode in tasks:
        if dry_run:
            results.append({'mode':mode, 'status':'dry_run_no_dispatch'})
            continue
        state_dir = Path(state_dir)
        state_dir.mkdir(parents=True, exist_ok=True)
        claim = state_dir/(date+'-'+slot.replace(':','')+'-'+mode+'.json')
        try:
            stream = claim.open('x', encoding='utf-8')
        except FileExistsError:
            results.append({'mode':mode, 'status':'attempt_already_recorded'})
            continue
        # Record intent before HTTP; a lost response never retries this same slot.
        with stream:
            json.dump({'date':date,'slot':slot,'mode':mode,'status':'dispatch_intent'},stream)
            stream.flush(); os.fsync(stream.fileno())
        body = {'ref':'main','inputs':{'mode':mode,'publication_date':date}}
        request = Request(ORIGIN+workflow+'/dispatches', data=json.dumps(body).encode(), method='POST',
                          headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
                                   'Content-Type':'application/json'})
        try:
            with send(request) as response:
                status = 'dispatched' if response.status == 204 else 'dispatch_rejected'
        except HTTPError as error:
            status = 'dispatch_http_'+str(error.code)
        except Exception:
            status = 'dispatch_outcome_unknown'
        result = {'date':date,'slot':slot,'mode':mode,'status':status}
        temporary = claim.with_suffix('.tmp')
        temporary.write_text(json.dumps(result),encoding='utf-8'); temporary.replace(claim)
        results.append(result)
    return results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-file',default='/etc/buffago-jalapeno-dispatch-token')
    parser.add_argument('--state-dir',default='/var/lib/buffago-jalapeno-scheduler')
    parser.add_argument('--check',action='store_true',help='GET-only credential/workflow check')
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    try:
        token=Path(args.token_file).read_text().strip()
        if not token.startswith('github_pat_') or any(c.isspace() for c in token):
            raise ValueError('fine_grained_dispatch_credential_required')
        if args.check:
            for workflow in (PUBLISH,METRICS):
                request=Request(ORIGIN+workflow,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'})
                with build_opener(NoRedirect()).open(request,timeout=20) as response:
                    data=json.load(response)
                    if data.get('state')!='active' or data.get('path')!='.github/workflows/'+workflow:
                        raise ValueError('workflow_not_active')
            print(json.dumps({'status':'dispatch_credential_read_check_passed','publication_attempted':False}))
            return 0
        results=dispatch(datetime.now(timezone.utc),token,args.state_dir,dry_run=args.dry_run)
        print(json.dumps({'attempts':results,'publication_confirmed':False}))
        return 1 if any(r['status'] not in {'dispatched','attempt_already_recorded','dry_run_no_dispatch'} for r in results) else 0
    except Exception:
        print('{"status":"scheduler_configuration_or_credential_failure","details":"withheld"}')
        return 1


if __name__=='__main__':
    raise SystemExit(main())
