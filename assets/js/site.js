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
// 홈 오른쪽 그림: 배포가 DEV → STG → LIVE 순서로 퍼져 나간다
// 각 환경의 서버(사각형)가 열 단위로 새 버전으로 바뀌고, 한 환경이 끝나야 다음 환경으로 넘어간다.
// 그 사이 서버 사이 연결선 위로 트래픽(점)이 흐른다. 동작 줄이기 설정이면 정지 화면 한 장만 그린다.
// ---------------------------------------------------------------------------

function initDeployArt() {
  const canvas = $('#deploy-art');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // 환경마다 랙(세로 캐비닛) 여러 개, 랙마다 1U 서버(가로 블레이드) 여러 대
  const bands = [
    { name: 'DEV', racks: 3, blades: 4, rackDelay: 420, traffic: 0.5 },
    { name: 'STG', racks: 3, blades: 4, rackDelay: 520, traffic: 0.7 },
    { name: 'LIVE', racks: 4, blades: 8, rackDelay: 900, traffic: 2.4 }
  ];
  const BLADE_MS = 520;
  const BLADE_GAP = 70;
  let W = 0;
  let H = 0;
  let colors = {};
  let version = 41;
  let packets = [];
  let start = performance.now();
  let raf = 0;
  let visible = true;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      node: v('--art-node'), line: v('--art-line'), ink: v('--art-ink'), packet: v('--art-packet'),
      deploy: v('--art-deploy'), ok: v('--art-ok'), font: cs.getPropertyValue('--font-sans')
    };
  };

  const layout = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 28;
    const gap = 30;
    const weights = bands.map((b) => b.blades + 2.2);
    const total = weights.reduce((x, y) => x + y, 0);
    const usable = H - pad * 2 - gap * (bands.length - 1);
    let y = pad;
    bands.forEach((b, i) => {
      b.top = y;
      b.h = (usable * weights[i]) / total;
      b.left = pad;
      b.w = W - pad * 2;
      b.head = 34;
      const rackGap = 14;
      b.rackW = (b.w - 28 - rackGap * (b.racks - 1)) / b.racks;
      b.rackGap = rackGap;
      b.rackTop = y + b.head + 16;
      b.rackH = b.h - b.head - 30;
      b.bladeH = Math.min(22, (b.rackH - 16) / b.blades - 6);
      b.busY = y + b.head + 6;
      y += b.h + gap;
    });
  };

  const rackX = (b, k) => b.left + 14 + k * (b.rackW + b.rackGap);
  const bladeY = (b, j) => b.rackTop + 8 + j * ((b.rackH - 16) / b.blades) + ((b.rackH - 16) / b.blades - b.bladeH) / 2;

  // 한 주기의 시간표: 환경별 시작/끝. 앞 환경이 끝나야 다음 환경이 시작된다(승격 대기 1.4초).
  const plan = (() => {
    let t = 700;
    return bands.map((b) => {
      const s = t;
      const e = s + b.rackDelay * (b.racks - 1) + BLADE_GAP * (b.blades - 1) + BLADE_MS;
      t = e + 1400;
      return { s, e };
    });
  })();
  const cycle = plan[plan.length - 1].e + 3000;

  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  const draw = (now) => {
    let t = reduceMotion ? 0 : now - start;
    if (t > cycle) { start = now; version += 1; t = 0; packets = []; }
    ctx.clearRect(0, 0, W, H);

    bands.forEach((b, i) => {
      const { s, e } = plan[i];
      const rolling = t >= s && t < e;
      const done = t >= e;

      // 캐비닛 바탕
      rr(b.left, b.top, b.w, b.h, 10);
      ctx.fillStyle = colors.node;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 머리줄: 환경 이름, 버전, 상태
      let updated = 0;
      const totalBlades = b.racks * b.blades;
      for (let k = 0; k < b.racks; k += 1) {
        for (let j = 0; j < b.blades; j += 1) {
          if (t >= s + k * b.rackDelay + j * BLADE_GAP + BLADE_MS) updated += 1;
        }
      }
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.ink;
      ctx.font = `700 11px ${colors.font}`;
      const hy = b.top + b.head / 2 + 2;
      ctx.fillText(b.name, b.left + 14, hy);
      ctx.font = `400 11px ${colors.font}`;
      ctx.globalAlpha = 0.6;
      const ver = rolling ? `v${version} → v${version + 1}` : `v${done && !reduceMotion ? version + 1 : version}`;
      ctx.fillText(ver, b.left + 14 + 44, hy);
      ctx.globalAlpha = 1;
      const state = rolling ? `배포 중 ${updated}/${totalBlades}` : '정상';
      const tw = ctx.measureText(state).width;
      const px = b.left + b.w - 14 - tw - 16;
      rr(px, hy - 9, tw + 16, 18, 9);
      ctx.fillStyle = rolling ? colors.deploy : colors.ok;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = rolling ? colors.deploy : colors.ok;
      ctx.fillText(state, px + 8, hy + 0.5);

      // 네트워크 버스와 랙 연결선
      ctx.strokeStyle = colors.line;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(b.left + 14, b.busY);
      ctx.lineTo(b.left + b.w - 14, b.busY);
      for (let k = 0; k < b.racks; k += 1) {
        const cx = rackX(b, k) + b.rackW / 2;
        ctx.moveTo(cx, b.busY);
        ctx.lineTo(cx, b.rackTop);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 랙과 서버
      for (let k = 0; k < b.racks; k += 1) {
        const x = rackX(b, k);
        rr(x, b.rackTop, b.rackW, b.rackH, 6);
        ctx.fillStyle = colors.ink;
        ctx.globalAlpha = 0.07;
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = colors.ink;
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (let j = 0; j < b.blades; j += 1) {
          const bs = s + k * b.rackDelay + j * BLADE_GAP;
          const p = Math.min(1, Math.max(0, (t - bs) / BLADE_MS));
          const fresh = p >= 1 ? Math.max(0, 1 - (t - bs - BLADE_MS) / 1500) : 0;
          const bx = x + 6;
          const by = bladeY(b, j);
          const bw = b.rackW - 12;
          rr(bx, by, bw, b.bladeH, 3);
          ctx.fillStyle = colors.node;
          ctx.fill();
          if (p > 0 && p < 1) {
            ctx.save();
            ctx.clip();
            ctx.fillStyle = colors.deploy;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(bx, by, bw * p, b.bladeH);
            ctx.restore();
          }
          ctx.strokeStyle = colors.ink;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1;
          rr(bx, by, bw, b.bladeH, 3);
          ctx.stroke();
          // 통풍구 줄
          ctx.globalAlpha = 0.22;
          ctx.beginPath();
          const vents = Math.max(2, Math.floor(bw / 22));
          for (let v = 0; v < vents; v += 1) {
            const vx = bx + bw * 0.42 + v * 5;
            if (vx > bx + bw - 8) break;
            ctx.moveTo(vx, by + 4);
            ctx.lineTo(vx, by + b.bladeH - 4);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          // LED 두 개: 전원(초록), 상태(교체 중 주황 / 막 끝나면 초록으로 번쩍)
          const ly = by + b.bladeH / 2;
          ctx.beginPath();
          ctx.arc(bx + 7, ly, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = colors.ok;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx + 13, ly, 1.8 + fresh * 1.2, 0, Math.PI * 2);
          ctx.fillStyle = p > 0 && p < 1 ? colors.deploy : colors.ok;
          ctx.globalAlpha = p > 0 && p < 1 ? 1 : 0.35 + fresh * 0.65;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // 다음 환경으로 승격
      if (i < bands.length - 1 && t >= e && t < e + 1400 && !reduceMotion) {
        const nb = bands[i + 1];
        const k = (t - e) / 1400;
        const x = b.left + b.w - 28;
        const y1 = b.top + b.h;
        const y2 = nb.top;
        ctx.strokeStyle = colors.deploy;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x, y1 + (y2 - y1) * (1 - (1 - k) ** 3), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.deploy;
        ctx.fill();
      }
    });

    // 트래픽: 버스를 따라 흐르다가 랙으로 내려간다
    if (!reduceMotion) {
      bands.forEach((b, i) => {
        if (Math.random() < b.traffic / 60) {
          packets.push({ i, x: 0, rack: Math.floor(Math.random() * b.racks), drop: 0, v: 0.25 + Math.random() * 0.15 });
        }
      });
      packets = packets.filter((p) => p.drop <= 1);
      packets.forEach((p) => {
        const b = bands[p.i];
        const tx = rackX(b, p.rack) + b.rackW / 2;
        const sx = b.left + 14;
        let x = sx + (tx - sx) * Math.min(1, p.x);
        let y = b.busY;
        if (p.x >= 1) {
          p.drop += 2.2 / 60;
          y = b.busY + (b.rackTop - b.busY) * Math.min(1, p.drop);
        } else {
          p.x += p.v / 60 * (b.w / Math.max(1, tx - sx));
        }
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = colors.packet;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  };

  const loop = (now) => {
    draw(now);
    if (!reduceMotion && visible) raf = requestAnimationFrame(loop);
  };

  const restart = () => {
    cancelAnimationFrame(raf);
    readColors();
    layout();
    raf = requestAnimationFrame(loop);
  };

  new ResizeObserver(restart).observe(canvas);
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting && !document.hidden;
    if (visible) restart(); else cancelAnimationFrame(raf);
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) restart(); else cancelAnimationFrame(raf);
  });
  theme.listeners.add(restart);
}

// ---------------------------------------------------------------------------

theme.init();
const openSearch = initSearch();
initKeys(openSearch);
initPost();
initDeployArt();
