"""Pi-owned goal approvals, separate from read-only app aggregates."""
from copy import deepcopy
import json
from pathlib import Path
from growth_goals import goal, moment
from state_geographies import wall_states


def apply_config(data, path):
    result = deepcopy(data)
    try:
        config = json.loads(Path(path).read_text(encoding='utf-8'))
        if config.get('schema_version') != 1:
            config = {}
    except (OSError, ValueError, TypeError):
        config = {}
    approved = config.get('approved') is True and moment(config.get('approved_at')) and bool(config.get('approved_by'))
    order = config.get('priority_states', []) if approved else config.get('review_states', [])
    # Nation is a dashboard-owned projection, never a cloud/app record.
    result['states'] = [s for s in result.get('states', []) if s.get('code') != 'US']
    # Old cached totals cannot masquerade as community counts during rollout.
    for state in result['states']:
        if state.get('contribution_basis') != 'founder_excluded_v1':
            for item in state['metrics']:
                if item['name'] in ('Ratings', 'Photos'):
                    item['current'] = None
    result['states'].append(wall_states(result['states'])[0])
    for state in result.get('states', []):
        proposals = config.get('targets', {}).get(state['code'], [])
        for item in state['metrics']:
            target = next((p for p in proposals if p.get('name') == item['name']), {})
            value = target.get('value') if approved and target.get('status') == 'approved' and target.get('unit') == item['unit'] else None
            item.update(goal(item['current'], value, item['unit']))
            item['deadline'] = target.get('deadline') if value is not None else None
        state['proposed_targets'] = [{k:p.get(k) for k in ('name','value','unit','deadline','status')} for p in proposals]
    result['states'] = sorted(result.get('states', []), key=lambda s:(order.index(s['code']) if s['code'] in order else len(order),s['code']))
    result['state_order'] = 'Approved priority order' if approved else 'Review candidates; targets Not set' if order else 'Alphabetical; priority Not set'
    return result
