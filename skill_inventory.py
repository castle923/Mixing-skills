"""Read-only inventory of personal skills, excluding bundled/plugin caches."""
import argparse
import json
import os
from pathlib import Path
import re
import tomllib

def scalar(value):
    value=value.strip()
    if value.startswith('"') and value.endswith('"'):
        try:
            return json.loads(value)
        except ValueError:
            return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value

def frontmatter(path):
    text=path.read_text(encoding='utf-8-sig')
    match=re.match(r'^---\s*\n(.*?)\n---(?:\s*\n|$)',text,re.S)
    if not match:
        raise ValueError('Missing frontmatter')
    lines=match.group(1).splitlines()
    result={}
    for index,line in enumerate(lines):
        field=re.match(r'^(name|description):\s*(.*)$',line)
        if not field:
            continue
        key,value=field.groups()
        if value in ('>','|','>-','|-',''):
            following=[]
            for next_line in lines[index+1:]:
                if next_line and not next_line[0].isspace():
                    break
                following.append(next_line.strip())
            value=' '.join(following)
        result[key]=scalar(value)
    return result

def inventory(home, roots=None):
    codex=Path(os.environ.get('CODEX_HOME',str(home/'.codex'))).expanduser()
    personal_roots = roots is None
    roots = [codex/'skills',home/'.agents/skills'] if roots is None else roots
    disabled=set()
    config=codex/'config.toml'
    if personal_roots and config.exists():
        parsed=tomllib.loads(config.read_text(encoding='utf-8-sig'))
        disabled={str(Path(item['path']).resolve()).casefold() for item in parsed.get('skills',{}).get('config',[]) if item.get('enabled') is False and item.get('path')}
    skills=[]
    errors=[]
    seen=set()
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob('SKILL.md'):
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                continue
            relative=path.relative_to(root)
            if any(part in ('.system','plugins','cache','.git') for part in relative.parts):
                continue
            try:
                metadata=frontmatter(path)
                name=metadata.get('name')
                if not name:
                    raise ValueError('Missing name')
                identity=(name,str(path.resolve()).casefold())
                if identity in seen:
                    continue
                seen.add(identity)
                skills.append({'name':name,'description':metadata.get('description',''),'invocation':'$'+name,'path':str(path),'origin':'synced' if 'synced' in relative.parts else 'local','disabled':str(path.resolve()).casefold() in disabled})
            except (OSError,UnicodeError,ValueError) as exc:
                errors.append({'path':str(path),'error':str(exc)})
    return {'skills':sorted(skills,key=lambda x:(x['origin'],x['name'],x['path'])),'errors':errors,'count':len(skills)}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--home',type=Path,default=Path.home(),help='Override the home directory for an isolated test')
    args=parser.parse_args()
    print(json.dumps(inventory(args.home),ensure_ascii=False,indent=2))
