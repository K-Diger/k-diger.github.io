# 용어 사전(_data/glossary.yml)의 각 용어가 글 본문에 처음 나오는 곳에 "(풀네임, 짧은 설명)"을 넣는다.
# 사용: 블로그 루트에서 python3 _tools/inline_terms.py           (미리보기: 바뀔 곳 수와 표본)
#       python3 _tools/inline_terms.py --apply   (적용)
# 건너뛰는 곳: 코드, 표, 제목, 링크, 다이어그램, 이미 괄호 설명이 있는 곳, "X는 ... 다." 정의 문장, 다른 분야 글(scope)

import json,re,glob,sys,collections
pass
import subprocess
G=json.loads(subprocess.check_output(['ruby','-ryaml','-rjson','-e','puts JSON.generate(YAML.load_file("_data/glossary.yml"))']))
S={g['term']:g.get('short','') for g in G}
APPLY='--apply' in sys.argv
def clean_full(g):
    f=g.get('full') or ''
    f=re.sub(r'\s*\(.*\)$','',f).strip()
    if not f or '+' in f or '/' in f or f.lower()==g['term'].lower(): return ''
    return f
forms=[]
for i,g in enumerate(G):
    for f in [g['term']]+(g.get('aka') or []):
        forms.append((f,i))
forms.sort(key=lambda x:-len(x[0]))
FORMSET={f for f,_ in forms}
def pat(f):
    if re.fullmatch(r'[\x00-\x7F]+',f): return r'(?<![A-Za-z0-9_-])'+re.escape(f)+r'(?![A-Za-z0-9_])'
    return r'(?<![가-힣])'+re.escape(f)
RX=re.compile('|'.join('(%s)'%pat(f) for f,_ in forms))
form_idx=[i for _,i in forms]
def mask(line):
    # 인라인 코드, 링크/이미지, URL, HTML 태그, 수식 영역을 같은 길이의 공백으로 가린다
    m=list(line)
    for r in [r'`[^`]*`', r'!?\[[^\]]*\]\([^)]*\)', r'https?://\S+', r'<[^>]+>', r'\$\$.*?\$\$', r'\$[^$]+\$', r'\{\{.*?\}\}', r'\{%.*?%\}']:
        for mm in re.finditer(r,line):
            for k in range(mm.start(),mm.end()): m[k]='\0'
    return ''.join(m)
DEF_AFTER=re.compile(r'\s*(\([^)]*\))?\s*(은|는|이란|란|이라는|라는|이라고|라고)\s')
total=collections.Counter(); samples=[]
for f in sorted(glob.glob('_posts/*.md')):
    s=open(f).read()
    fm_end=s.index('\n---',3)+4
    fm=s[:fm_end]; body=s[fm_end:]
    cats=re.search(r'^categories:\s*\[(.*)\]',fm,re.M); cats=[c.strip() for c in cats.group(1).split(',')] if cats else []
    lines=body.split('\n'); used=set(); infence=False; inmath=False; changes=0
    for li,line in enumerate(lines):
        st=line.lstrip()
        if st.startswith('```') or st.startswith('~~~'): infence=not infence; continue
        if infence: continue
        if st.startswith('$$'): inmath=not inmath if st.count('$$')==1 else inmath; continue
        if inmath or not st or st.startswith('#') or st.startswith('|') or st.startswith('<') or st.startswith('{%') or st.startswith('---') or st.startswith('>'): continue
        mline=mask(line); out=[]; last=0; occupied=[]
        for mm in RX.finditer(mline):
            idx=form_idx[mm.lastindex-1]; g=G[idx]
            if idx in used: continue
            sc=g.get('scope')
            if sc and not any(c in cats for c in sc): continue
            a,b=mm.start(),mm.end()
            used.add(idx)   # 첫 등장은 소비한다(설명을 넣든 안 넣든)
            # 이미 열린 괄호 안에 있는 용어는 건너뜀("(Jaeger, Tempo" 같은 나열 안)
            before=mline[:a]
            if before.count('(')>before.count(')') or before.count('（')>before.count('）'): continue
            # 용어 바로 뒤가 이미 괄호면(굵게 표시 안이라도) 설명이 있는 것으로 본다
            if line[b:b+1]=='(' or line[b:b+2]==' (': continue
            if re.match(r' [A-Z][A-Za-z]+\(',line[b:]): continue   # "Ambient Mesh(…)"처럼 복합 명사 뒤에 이미 설명이 있음(재실행 시 중복 방지)
            ins_at=b
            # 영문 복합 명사("Ambient Mesh", "Waypoint Proxy")면 그 단어 뒤에 넣는다
            cm=re.match(r' [A-Z][A-Za-z]+(?![A-Za-z(])',line[b:])
            if cm and re.fullmatch(r'[\x00-\x7F]+',mm.group(0)):
                # 뒤 단어가 따로 사전에 있는 용어면("OpenTelemetry Collector") 앞 용어 설명을 붙이면 뜻이 섞인다 → 다음 등장 때 설명
                if cm.group(0).strip() in FORMSET: used.discard(idx); continue
                # 뒤 단어가 앞 용어의 다른 이름일 뿐인 경우(Ambient Mesh, Waypoint Proxy)만 그 뒤로 옮긴다. Helm Chart 같은 경우는 용어 바로 뒤에 둔다
                if cm.group(0).strip() in ('Mesh', 'Proxy', 'Mode', 'Mesh의'): ins_at=b+cm.end()
            # 굵게 표시 구간 안: 짧은 구간이면 닫는 ** 뒤에, 문장처럼 긴 구간이면 용어 바로 뒤에 넣는다
            if line[:a].count('**')%2==1:
                close=line.find('**',ins_at)
                if close==-1: continue
                if close-ins_at<=8 and '다' not in line[ins_at:close]: ins_at=close+2
            # 같은 자리에 이미 다른 용어 설명이 들어가면("Cilium CNI") 이번 용어는 다음 등장 때 설명한다
            if any(pos==ins_at for pos,_ in out): used.discard(idx); continue
            post=line[ins_at:]
            # 이미 괄호 설명이 있거나 괄호 안에 있는 표기면 건너뜀
            if post.startswith('(') or post.startswith(' (') or line[:a].rstrip().endswith('('): continue
            # 같은 문장에서 정의하는 경우 건너뜀: "X는 ... 다."
            sent_end=line.find('다.',b)
            if DEF_AFTER.match(line[ins_at:]) and sent_end!=-1: continue
            # 같은 줄에 이미 그 용어의 풀네임이 쓰여 있으면 건너뜀
            full=clean_full(g)
            if full and full.lower() in line.lower(): full=''
            gloss=(full+', ' if full else '')+S[g['term']]
            out.append((ins_at,'('+gloss+')')); changes+=1
            samples.append((f,line[max(0,a-30):ins_at].strip()+'('+gloss+')'))
        if out:
            for pos,txt in sorted(out,reverse=True): line=line[:pos]+txt+line[pos:]
            lines[li]=line
    total[f]=changes
    if APPLY and changes: open(f,'w').write(fm+'\n'.join(lines))
print('posts changed',sum(1 for v in total.values() if v),'insertions',sum(total.values()))
for f,c in total.most_common(12): print(c,f)
import random; random.seed(3)
for f,t in random.sample(samples,min(25,len(samples))): print('-',f[7:30],'|',t)
