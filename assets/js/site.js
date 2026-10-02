// 사이트 전체 스크립트. 빌드 단계 없이 ES 모듈 하나로 동작한다.
// 무거운 의존성(Mermaid, MathJax)은 해당 콘텐츠가 있는 글에서만 동적으로 불러온다.

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs';
const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } }
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 테마: auto → light → dark 순환. auto 는 OS 설정을 따른다.
// ---------------------------------------------------------------------------

const theme = {
  get mode() {
    const t = store.get('theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  },
  get isDark() {
    const m = this.mode;
    return m === 'dark' || (m === 'auto' && darkQuery.matches);
  },
  listeners: new Set(),
  apply(mode) {
    const root = document.documentElement;
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
      store.set('theme', null);
    } else {
      root.setAttribute('data-theme', mode);
      store.set('theme', mode);
    }
    this.render();
    this.listeners.forEach((fn) => fn());
  },
  render() {
    const btn = $('#theme-toggle');
    if (btn) {
      const label = { auto: '자동', light: '밝게', dark: '어둡게' }[this.mode];
      $('.theme-label', btn).textContent = label;
      btn.setAttribute('aria-label', `화면 테마: ${label}. 눌러서 바꾸기`);
    }
  },
  init() {
    this.render();
    $('#theme-toggle')?.addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      this.apply(order[(order.indexOf(this.mode) + 1) % order.length]);
    });
    darkQuery.addEventListener('change', () => {
      if (this.mode === 'auto') this.listeners.forEach((fn) => fn());
    });
  }
};

// 같은 출처 iframe(인터랙티브 데모)에 테마를 넘긴다
function syncFrameTheme(frame) {
  try {
    const doc = frame.contentDocument;
    if (doc?.documentElement) doc.documentElement.setAttribute('data-theme', theme.isDark ? 'dark' : 'light');
  } catch { /* 다른 출처 iframe 은 건드리지 않는다 */ }
}

function initFrames(root) {
  const frames = $$('iframe', root);
  frames.forEach((f) => {
    f.addEventListener('load', () => syncFrameTheme(f));
    syncFrameTheme(f);
  });
  theme.listeners.add(() => frames.forEach(syncFrameTheme));
}

// ---------------------------------------------------------------------------
// 검색: ⌘K / "/" 로 여는 대화상자. 색인은 처음 열 때 한 번만 받는다.
// ---------------------------------------------------------------------------

function initSearch() {
  const dialog = $('#search-dialog');
  const input = $('#search-input');
  const list = $('#search-results');
  const status = $('#search-status');
  if (!dialog || !input) return null;

  let index = null;
  let loading = null;
  let hits = [];
  let selected = -1;
  let timer = 0;

  const load = () => {
    loading ??= fetch(input.dataset.index)
      .then((r) => r.json())
      .then((data) => {
        index = data.map((p) => ({
          ...p,
          tl: p.t.toLowerCase(),
          ml: `${p.g} ${p.c}`.toLowerCase(),
          xl: p.x.toLowerCase()
        }));
      })
      .catch(() => {
        loading = null;
        status.textContent = '검색 색인을 불러오지 못했습니다. 네트워크 상태를 확인하고 다시 입력하세요.';
      });
    return loading;
  };

  const countOf = (hay, needle, cap) => {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1 && n < cap) {
      n += 1;
      i = hay.indexOf(needle, i + needle.length);
    }
    return n;
  };

  // 한글 표기와 영문 표기를 같은 낱말로 본다(쿠버네티스 = kubernetes)
  const ALIAS = [
    ['쿠버네티스', 'kubernetes', 'k8s'], ['카프카', 'kafka'], ['레디스', 'redis'], ['엘라스틱서치', 'elasticsearch'],
    ['스프링', 'spring'], ['자바', 'java'], ['코틀린', 'kotlin'], ['헬름', 'helm'], ['이스티오', 'istio'],
    ['실리움', 'cilium'], ['아르고', 'argocd'], ['오픈텔레메트리', 'opentelemetry', 'otel'], ['그라파나', 'grafana'],
    ['도커', 'docker'], ['테라폼', 'terraform'], ['몽고', 'mongodb'], ['마이에스큐엘', 'mysql'], ['관측성', 'observability'],
    ['보안', 'security'], ['인증', 'auth'], ['트랜잭션', 'transaction'], ['인덱스', 'index'], ['캐시', 'cache'], ['에이전트', 'agent']
  ];
  const variants = (t) => {
    const hit = ALIAS.find((g) => g.some((a) => t === a || (t.length >= 3 && a.startsWith(t))));
    return hit ? [...new Set([t, ...hit])] : [t];
  };

  const run = (q) => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || !index) return [];
    const out = [];
    for (const p of index) {
      let score = 0;
      let ok = true;
      for (const t of terms) {
        let best = 0;
        for (const v of variants(t)) {
          const inTitle = p.tl.includes(v);
          const inMeta = p.ml.includes(v);
          const n = countOf(p.xl, v, 20);
          if (!inTitle && !inMeta && !n) continue;
          best = Math.max(best, (inTitle ? 30 + (p.tl.startsWith(v) ? 10 : 0) : 0) + (inMeta ? 12 : 0) + Math.log2(1 + n) * 3);
        }
        if (!best) { ok = false; break; }
        score += best;
      }
      if (ok) out.push({ p, score });
    }
    out.sort((a, b) => b.score - a.score || (a.p.d < b.p.d ? 1 : -1));
    return out.slice(0, 30).map((o) => o.p);
  };

  const highlight = (text, terms) => {
    let html = escapeHtml(text);
    if (!terms.length) return html;
    const re = new RegExp(`(${terms.map((t) => escapeRegExp(escapeHtml(t))).join('|')})`, 'gi');
    return html.replace(re, '<mark>$1</mark>');
  };

  const snippet = (p, terms) => {
    const at = terms.map((t) => p.xl.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at === undefined) return p.x.slice(0, 120);
    const start = Math.max(0, at - 50);
    return (start > 0 ? '…' : '') + p.x.slice(start, at + 110) + '…';
  };

  const select = (i) => {
    const items = $$('.search-hit', list);
    items.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    selected = i;
    if (items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const render = () => {
    const q = input.value.trim();
    if (!q) { list.innerHTML = ''; hits = []; status.textContent = ''; return; }
    if (!index) { status.textContent = '색인 불러오는 중…'; return; }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean).flatMap(variants);
    hits = run(q);
    status.textContent = hits.length
      ? `${hits.length}${hits.length === 30 ? '+' : ''}개 글`
      : '일치하는 글이 없습니다. 다른 낱말이나 영문 표기로 찾아보세요.';
    list.innerHTML = hits.map((p, i) => `
      <li class="search-hit" id="hit-${i}" role="option" aria-selected="false">
        <a href="${p.u}">
          <span class="hit-title">${highlight(p.t, terms)}</span>
          <span class="hit-meta">${p.d.replace(/-/g, '. ')}&ensp;${escapeHtml(p.c)}</span>
          <span class="hit-snippet">${highlight(snippet(p, terms), terms)}</span>
        </a>
      </li>`).join('');
    select(hits.length ? 0 : -1);
  };

  const open = (q) => {
    if (!dialog.open) dialog.showModal();
    if (typeof q === 'string') input.value = q;
    input.focus();
    input.select();
    load().then(render);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => (index ? render() : load().then(render)), 60);
  });
  input.addEventListener('keydown', (e) => {
    const n = hits.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); select((selected + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); select((selected - 1 + n) % n); }
    else if (e.key === 'Enter') {
      const a = $$('.search-hit a', list)[Math.max(selected, 0)];
      if (a) { e.preventDefault(); location.href = a.href; }
    }
  });
  // 바깥(배경)을 누르면 닫는다
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  $('#search-open')?.addEventListener('click', () => open());
  $$('[data-open-search]').forEach((b) => b.addEventListener('click', () => open()));

  // 맥이 아니면 단축키 표기를 Ctrl K 로
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$('#search-open kbd').forEach((k) => { k.textContent = 'Ctrl K'; });

  // 404 페이지: 경로 마지막 조각으로 바로 검색을 걸어 준다
  if ($('.not-found')) {
    const guess = decodeURIComponent(location.pathname).split('/').filter(Boolean).pop() || '';
    if (guess && !/\.(html?|xml|json|js|css)$/.test(guess)) open(guess.replace(/[-_]+/g, ' '));
  }
  return open;
}

// ---------------------------------------------------------------------------
// 전역 단축키: / 또는 Ctrl/⌘+K = 검색
// ---------------------------------------------------------------------------

function initKeys(openSearch) {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      openSearch?.();
    }
  });
}

let zoomDialog = null;

function openZoom(title, node) {
  if (!zoomDialog) {
    zoomDialog = document.createElement('dialog');
    zoomDialog.className = 'zoom-dialog';
    zoomDialog.innerHTML = `
      <div class="zoom-bar"><span class="zoom-title"></span><button type="button" class="zoom-close">닫기 (Esc)</button></div>
      <div class="zoom-body"></div>`;
    document.body.append(zoomDialog);
    $('.zoom-close', zoomDialog).addEventListener('click', () => zoomDialog.close());
    zoomDialog.addEventListener('click', (e) => { if (e.target.classList.contains('zoom-body')) zoomDialog.close(); });
    zoomDialog.addEventListener('close', () => { $('.zoom-body', zoomDialog).innerHTML = ''; });
  }
  $('.zoom-title', zoomDialog).textContent = title;
  $('.zoom-body', zoomDialog).replaceChildren(node);
  zoomDialog.showModal();
}

// ---------------------------------------------------------------------------
// 글 본문 다듬기
// ---------------------------------------------------------------------------

function buildToc(body) {
  const heads = $$(':scope > h2[id], :scope > h3[id]', body);
  if (heads.length < 2) return heads;

  const make = () => {
    const root = document.createElement('ol');
    let sub = null;
    for (const h of heads) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${encodeURIComponent(h.id)}`;
      a.textContent = h.textContent.trim();
      a.dataset.target = h.id;
      li.append(a);
      if (h.tagName === 'H3' && root.lastElementChild) {
        if (!sub) {
          sub = document.createElement('ol');
          root.lastElementChild.append(sub);
        }
        sub.append(li);
      } else {
        root.append(li);
        sub = null;
      }
    }
    return root;
  };

  const rail = $('.toc-rail');
  const inline = $('.toc-inline');
  if (rail) { $('.toc', rail).append(make()); rail.hidden = false; }
  if (inline) {
    $('.toc', inline).append(make());
    inline.hidden = false;
    $('summary', inline).textContent = `목차 (${heads.length})`;
    inline.addEventListener('click', (e) => { if (e.target.closest('a')) inline.open = false; });
  }

  // 스크롤 스파이: 헤더 아래 기준선을 지난 마지막 제목을 현재 위치로 본다
  const links = $$('.toc a');
  const railBox = rail && $('.toc', rail);
  let current = null;
  let ticking = false;
  const spy = () => {
    ticking = false;
    const line = 40;
    let active = null;
    for (const h of heads) {
      if (h.getBoundingClientRect().top - line <= 1) active = h; else break;
    }
    const id = active?.id ?? null;
    if (id === current) return;
    current = id;
    const activeIdx = heads.findIndex((h) => h.id === id);
    const order = new Map(heads.map((h, i) => [h.id, i]));
    links.forEach((a) => {
      a.classList.toggle('is-active', a.dataset.target === id);
      a.classList.toggle('is-read', order.get(a.dataset.target) < activeIdx);
    });
    const railLink = railBox && links.find((a) => railBox.contains(a) && a.dataset.target === id);
    if (railLink) {
      const top = railLink.offsetTop - railBox.offsetTop;
      if (top < railBox.scrollTop + 40 || top > railBox.scrollTop + railBox.clientHeight - 60) {
        railBox.scrollTo({ top: top - railBox.clientHeight / 3, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
  spy();
  return heads;
}

function addHeadingAnchors(body) {
  $$(':scope > :is(h2, h3, h4, h5, h6)[id]', body).forEach((h) => {
    const a = document.createElement('a');
    a.className = 'hanchor';
    a.href = `#${encodeURIComponent(h.id)}`;
    a.textContent = '#';
    a.setAttribute('aria-label', `"${h.textContent.trim()}" 절 링크`);
    a.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}#${encodeURIComponent(h.id)}`;
      navigator.clipboard?.writeText(url).catch(() => {});
    });
    h.prepend(a);
  });
}

function enhanceCode(body) {
  // rouge 가 모르는 언어(promql, logql 등)는 래퍼 없이 <pre><code> 로 나오므로 같은 구조로 감싼다
  $$('pre > code[class*="language-"]', body).forEach((code) => {
    const pre = code.parentElement;
    if (code.classList.contains('language-mermaid') || pre.closest('.highlight')) return;
    const outer = document.createElement('div');
    outer.className = `${code.className} highlighter-rouge`;
    const inner = document.createElement('div');
    inner.className = 'highlight';
    pre.before(outer);
    inner.append(pre);
    outer.append(inner);
  });

  $$('div.highlighter-rouge', body).forEach((block) => {
    if (block.classList.contains('language-mermaid')) return;
    const lang = (block.className.match(/language-(\S+)/)?.[1] || 'text').replace(/^plaintext$/, 'text');
    const code = $('code', block);
    if (!code) return;

    const head = document.createElement('div');
    head.className = 'code-head';
    head.innerHTML = `<span class="code-lang">${escapeHtml(lang)}</span><button type="button" class="code-copy">복사</button>`;
    block.prepend(head);

    const btn = $('.code-copy', head);
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
        btn.textContent = '복사됨';
        btn.dataset.state = 'done';
      } catch {
        btn.textContent = '복사 실패';
      }
      setTimeout(() => { btn.textContent = '복사'; delete btn.dataset.state; }, 1600);
    });

    const lines = code.innerText.split('\n').length;
    if (lines > 45) {
      block.classList.add('is-long');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'code-expand';
      const label = () => (block.classList.contains('is-open') ? '접기' : `전체 보기 (${lines}줄)`);
      more.textContent = label();
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        const opening = !block.classList.contains('is-open');
        block.classList.toggle('is-open', opening);
        more.textContent = label();
        more.setAttribute('aria-expanded', String(opening));
        if (!opening) block.scrollIntoView({ block: 'nearest' });
      });
      block.append(more);
    }
  });
}

function wrapTables(body) {
  $$('table', body).forEach((t) => {
    if (t.closest('.highlight, .table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.before(wrap);
    wrap.append(t);
  });
  // 실제로 넘치는 표만 키보드로 스크롤할 수 있게 한다
  const mark = () => $$('.table-wrap', body).forEach((w) => {
    const over = w.scrollWidth > w.clientWidth + 1;
    if (over) { w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', '표, 가로로 스크롤'); }
    else { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label'); }
  });
  mark();
  addEventListener('resize', mark, { passive: true });
}

function enhanceImages(body) {
  $$('img', body).forEach((img) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (img.closest('a')) return;
    img.addEventListener('click', () => {
      const big = img.cloneNode();
      big.removeAttribute('loading');
      openZoom(img.alt || '이미지', big);
    });
  });
}

function externalLinks(body) {
  $$('a[href^="http"]', body).forEach((a) => {
    if (a.host !== location.host) { a.target = '_blank'; a.rel = 'noopener'; }
  });
}

// ----- Mermaid -----

function mermaidTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const ink = v('--ink');
  const bg = v('--bg');
  const bg2 = v('--bg-2');
  const bg3 = v('--bg-3');
  const rule = v('--rule');
  const ink2 = v('--ink-2');
  const mark = v('--mark');
  return {
    darkMode: theme.isDark,
    background: bg,
    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
    fontSize: '15px',
    primaryColor: bg,
    primaryTextColor: ink,
    primaryBorderColor: ink,
    secondaryColor: bg2,
    secondaryTextColor: ink,
    secondaryBorderColor: ink2,
    tertiaryColor: bg3,
    tertiaryTextColor: ink,
    tertiaryBorderColor: ink2,
    lineColor: ink2,
    textColor: ink,
    mainBkg: bg,
    nodeBorder: ink,
    clusterBkg: bg2,
    clusterBorder: ink2,
    titleColor: ink,
    edgeLabelBackground: bg,
    noteBkgColor: mark,
    noteTextColor: v('--mark-ink'),
    noteBorderColor: ink2,
    actorBkg: bg,
    actorBorder: ink,
    actorTextColor: ink,
    actorLineColor: ink2,
    signalColor: ink,
    signalTextColor: ink,
    labelBoxBkgColor: bg2,
    labelBoxBorderColor: ink2,
    labelTextColor: ink,
    loopTextColor: ink,
    activationBkgColor: bg3,
    activationBorderColor: ink2,
    sequenceNumberColor: bg,
    altSectionBkgColor: bg2,
    sectionBkgColor: bg2,
    sectionBkgColor2: bg3,
    taskBkgColor: bg3,
    taskBorderColor: ink2,
    taskTextColor: ink,
    gridColor: rule,
    pie1: v('--link'),
    pieStrokeColor: bg,
    pieOuterStrokeColor: ink2,
    pieTitleTextColor: ink,
    pieSectionTextColor: bg,
    git0: v('--link'),
    classText: ink,
    relationColor: ink2,
    stateBkg: bg,
    stateLabelColor: ink,
    compositeBackground: bg2,
    errorBkgColor: mark,
    errorTextColor: ink
  };
}

function initMermaid(body) {
  // rouge 가 모르는 언어라 kramdown 이 <pre><code class="language-mermaid"> 로만 내보내는 경우와
  // div.language-mermaid 로 감싸는 경우를 모두 받는다
  const blocks = $$('code.language-mermaid', body).map((c) => c.closest('div.language-mermaid') || c.closest('pre') || c);
  if (!blocks.length) return;

  const diagrams = blocks.map((block, i) => {
    const src = $('code', block)?.textContent ?? block.textContent;
    const fig = document.createElement('figure');
    fig.className = 'diagram tex2jax_ignore';
    fig.innerHTML = `
      <div class="code-head"><span class="code-lang">다이어그램</span><button type="button" class="code-copy" disabled>확대</button></div>
      <div class="diagram__canvas"><pre></pre></div>`;
    $('pre', fig).textContent = src;
    block.replaceWith(fig);
    const d = { fig, src, id: `mmd-${i}`, rendered: false, queued: false };
    $('.code-copy', fig).addEventListener('click', () => {
      const svg = $('.diagram__canvas svg', fig);
      if (!svg) return;
      const clone = svg.cloneNode(true);
      const w = svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width;
      clone.removeAttribute('style');
      clone.setAttribute('width', String(Math.max(w, 320)));
      clone.removeAttribute('height');
      openZoom('다이어그램', clone);
    });
    return d;
  });

  let mermaid = null;
  let chain = Promise.resolve();

  const ready = (async () => {
    // 글꼴이 다 내려온 뒤 그려야 라벨 너비가 정확히 재진다(먼저 그리면 글자가 상자 밖으로 잘린다)
    await document.fonts.ready;
    mermaid = (await import(MERMAID_URL)).default;
  })();

  const configure = () => mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: mermaidTheme(),
    securityLevel: 'strict',
    flowchart: { htmlLabels: true, curve: 'basis', padding: 12 },
    sequence: { mirrorActors: false },
    fontFamily: '"Pretendard Variable", Pretendard, sans-serif'
  });

  let renderSeq = 0;
  const render = (d) => {
    chain = chain.then(async () => {
      await ready;
      const canvas = $('.diagram__canvas', d.fig);
      try {
        const { svg } = await mermaid.render(`${d.id}-${(renderSeq += 1)}`, d.src);
        canvas.innerHTML = svg;
        const el = $('svg', canvas);
        const natural = el?.viewBox?.baseVal?.width || 0;
        // 칸에 맞춰 줄이되 원래 크기의 75% 밑으로는 줄이지 않는다(15px 라벨이 11px 아래로 내려가면 읽기 어렵다).
        // 그보다 넓으면 가로 스크롤로 보여 준다.
        const avail = canvas.clientWidth - 32;
        const wide = natural * 0.75 > avail;
        canvas.classList.toggle('is-wide', wide);
        if (el) el.style.width = wide ? `${Math.round(natural * 0.75)}px` : '';
        d.fig.classList.remove('diagram--error');
        $('.code-copy', d.fig).disabled = false;
      } catch (err) {
        d.fig.classList.add('diagram--error');
        canvas.innerHTML = '';
        const pre = document.createElement('pre');
        pre.textContent = `다이어그램을 그리지 못해 원문을 표시합니다.\n${err?.message ?? ''}\n\n${d.src}`;
        canvas.append(pre);
        $$('[id^="d' + d.id + '"]').forEach((n) => n.remove());
      }
      d.rendered = true;
    });
    return chain;
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const d = diagrams.find((x) => x.fig === e.target);
      io.unobserve(e.target);
      if (d && !d.queued) {
        d.queued = true;
        ready.then(() => { if (!render.configured) { configure(); render.configured = true; } render(d); });
      }
    });
  }, { rootMargin: '1200px 0px' });
  diagrams.forEach((d) => io.observe(d.fig));

  theme.listeners.add(() => {
    if (!mermaid) return;
    // 토큰 값이 바뀐 다음 프레임에 다시 칠한다
    requestAnimationFrame(() => {
      configure();
      diagrams.filter((d) => d.rendered).forEach(render);
    });
  });
}

// ----- MathJax: 글에 실제 수식 구분자가 있을 때만 -----

function initMath(article, body) {
  if (article.dataset.math !== 'true') return;
  const text = body.textContent;
  if (!/\$[^$\s]|\\\(|\\\[/.test(text)) return;
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      tags: 'ams'
    },
    options: {
      ignoreHtmlClass: 'tex2jax_ignore',
      processHtmlClass: 'tex2jax_process'
    },
    chtml: { scale: 1.0 }
  };
  const s = document.createElement('script');
  s.src = MATHJAX_URL;
  s.async = true;
  document.head.append(s);
}

function initPost() {
  const article = $('.post-layout');
  const body = $('#post-body');
  if (!article || !body) return;
  buildToc(body);
  addHeadingAnchors(body);
  enhanceCode(body);
  wrapTables(body);
  enhanceImages(body);
  externalLinks(body);
  initFrames(body);
  initMermaid(body);
  initMath(article, body);
}

// ---------------------------------------------------------------------------

theme.init();
const openSearch = initSearch();
initKeys(openSearch);
initPost();
